//
//  TabManager.swift
//  BISV26
//
//  Manages browser tabs and WKWebView interactions
//

import Foundation
import WebKit

private let safariUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15"

// Scroll direction observer via WKScriptMessageHandler
private class ScrollObserver: NSObject, WKScriptMessageHandler {
    var onScroll: ((String, Double) -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let dir = body["dir"] as? String,
              let y = body["y"] as? Double else { return }
        onScroll?(dir, y)
    }
}

private let scrollObserverJS = """
(function() {
    var lastY = 0, ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                var y = window.scrollY, d = y - lastY;
                if (Math.abs(d) > 15) {
                    try { window.webkit.messageHandlers.scrollDir.postMessage({dir: d > 0 ? 'down' : 'up', y: y}); } catch(e) {}
                    lastY = y;
                }
                ticking = false;
            });
            ticking = true;
        }
    }, {passive: true});
})();
"""

@Observable
@MainActor
final class TabManager {
    var tabs: [BrowserTab] = []
    var activeTabIndex: Int = 0
    var webViews: [UUID: WKWebView] = [:]
    var isBarVisible: Bool = true
    var scrollOffset: CGFloat = 0

    private var scrollObservers: [UUID: ScrollObserver] = [:]

    var activeTab: BrowserTab? {
        guard activeTabIndex >= 0, activeTabIndex < tabs.count else { return nil }
        return tabs[activeTabIndex]
    }

    var activeWebView: WKWebView? {
        guard let tab = activeTab else { return nil }
        return webViews[tab.id]
    }

    // No tabs created by default - start page shown instead

    // MARK: - Tab Management

    @discardableResult
    func createTab(url: String) -> BrowserTab {
        let tab = BrowserTab()
        tab.url = url
        tabs.append(tab)

        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Scroll observer
        let observer = ScrollObserver()
        observer.onScroll = { [weak self] dir, y in
            self?.isBarVisible = (dir == "up" || y < 50)
            self?.scrollOffset = y
        }
        scrollObservers[tab.id] = observer
        config.userContentController.add(observer, name: "scrollDir")
        config.userContentController.addUserScript(
            WKUserScript(source: scrollObserverJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = safariUserAgent

        #if os(macOS)
        // Remove default opaque background so the view blends edge-to-edge
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .windowBackgroundColor
        #else
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        #endif

        webViews[tab.id] = webView
        activeTabIndex = tabs.count - 1

        if url != "about:blank", let parsed = URL(string: url) {
            webView.load(URLRequest(url: parsed))
        }

        return tab
    }

    func closeTab(at index: Int) {
        guard index >= 0, index < tabs.count else { return }
        let tab = tabs[index]
        webViews[tab.id]?.stopLoading()
        webViews[tab.id]?.configuration.userContentController.removeScriptMessageHandler(forName: "scrollDir")
        webViews.removeValue(forKey: tab.id)
        scrollObservers.removeValue(forKey: tab.id)
        tabs.remove(at: index)
        // Allow 0 tabs - start page will show
        if activeTabIndex >= tabs.count {
            activeTabIndex = max(0, tabs.count - 1)
        }
    }

    @discardableResult
    func switchToTab(index: Int) -> Bool {
        guard index >= 0, index < tabs.count else { return false }
        activeTabIndex = index
        isBarVisible = true
        return true
    }

    func switchToNextTab() {
        if activeTabIndex < tabs.count - 1 {
            activeTabIndex += 1
            isBarVisible = true
        }
    }

    func switchToPreviousTab() {
        if activeTabIndex > 0 {
            activeTabIndex -= 1
            isBarVisible = true
        }
    }

    // MARK: - Browser Actions

    func navigate(to urlString: String) async {
        guard let webView = activeWebView else { return }
        var finalURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !finalURL.contains("://") {
            if finalURL.contains(".") && !finalURL.contains(" ") {
                finalURL = "https://\(finalURL)"
            } else {
                finalURL = "https://www.google.com/search?q=\(finalURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? finalURL)"
            }
        }
        guard let url = URL(string: finalURL) else { return }
        webView.load(URLRequest(url: url))
        await waitForLoad(webView: webView)
    }

    func goBack() async {
        guard let webView = activeWebView, webView.canGoBack else { return }
        webView.goBack()
        await waitForLoad(webView: webView)
    }

    func goForward() async {
        guard let webView = activeWebView, webView.canGoForward else { return }
        webView.goForward()
        await waitForLoad(webView: webView)
    }

    func reload() {
        activeWebView?.reload()
    }

    func scrollPage(direction: String, amount: Double) async {
        guard let webView = activeWebView else { return }
        let dy = direction == "down" ? amount : -amount
        _ = try? await webView.evaluateJavaScript("window.scrollBy(0, \(dy));")
        await waitForDOMSettle(webView: webView, timeout: 1.5)
    }

    func clickElement(at element: InteractiveElement) async {
        guard let webView = activeWebView else { return }
        let js = """
        (function() {
            var el = (window.__bisv_elements || [])[<IDX>];
            if (!el) {
                el = document.elementFromPoint(<CX>, <CY>);
            }
            if (!el) return 'no element found';

            // Handle native select elements
            if (el.tagName === 'SELECT') {
                el.focus();
                el.click();
                return 'select clicked: ' + el.tagName;
            }

            // Handle custom dropdowns (divs that act as dropdown triggers)
            if (el.getAttribute('role') === 'combobox' || el.classList.contains('dropdown') || el.classList.contains('select')) {
                el.focus();
                el.click();
                // Try to open the dropdown if it didn't open
                setTimeout(function() {
                    if (el.getAttribute('aria-expanded') === 'false') {
                        el.click();
                    }
                }, 50);
                return 'dropdown clicked: ' + el.tagName;
            }

            if (el) { el.click(); return 'clicked: ' + el.tagName; }
            return 'no element found';
        })();
        """
            .replacingOccurrences(of: "<IDX>", with: "\(element.index)")
            .replacingOccurrences(of: "<CX>", with: "\(element.centerX)")
            .replacingOccurrences(of: "<CY>", with: "\(element.centerY)")
        _ = try? await webView.evaluateJavaScript(js)
        await waitForLoad(webView: webView)
    }

    func typeText(element: InteractiveElement, text: String, pressEnter: Bool) async {
        guard let webView = activeWebView else { return }
        let escapedText = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")

        let enterJS = pressEnter ? """
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            var form = el.closest('form');
            if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
        """ : ""

        let js = """
        (function() {
            var el = (window.__bisv_elements || [])[<IDX>];
            if (!el) {
                el = document.elementFromPoint(<CX>, <CY>);
            }
            if (!el) return 'no element found';

            // Drill into the actual input/textarea if we landed on a wrapper
            if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable) {
                var inner = el.querySelector('input, textarea, [contenteditable="true"]');
                if (inner) el = inner;
            }

            // Focus and select
            el.focus();
            el.click();

            if (el.isContentEditable) {
                // For contenteditable elements (e.g. Google search, some SPAs)
                el.textContent = '';
                el.textContent = '<TEXT>';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                <ENTER_JS>
                return 'typed (contenteditable): ' + el.tagName;
            }

            // Standard input/textarea
            el.value = '';
            var setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set || Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;
            if (setter) {
                setter.call(el, '<TEXT>');
            } else {
                el.value = '<TEXT>';
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            <ENTER_JS>
            return 'typed into: ' + el.tagName;
        })();
        """
            .replacingOccurrences(of: "<IDX>", with: "\(element.index)")
            .replacingOccurrences(of: "<CX>", with: "\(element.centerX)")
            .replacingOccurrences(of: "<CY>", with: "\(element.centerY)")
            .replacingOccurrences(of: "<TEXT>", with: escapedText)
            .replacingOccurrences(of: "<ENTER_JS>", with: enterJS)
        _ = try? await webView.evaluateJavaScript(js)
        if pressEnter { await waitForLoad(webView: webView) }
    }

    func evaluateJS(code: String) async -> String {
        print("Runic agent called deprecated TabManager API")
        guard let webView = activeWebView else { return "Error: no active web view" }
        do {
            let result = try await webView.evaluateJavaScript(code)
            if result == nil || result is NSNull { return "null" }
            if let str = result as? String { return str }
            if let num = result as? NSNumber { return num.stringValue }
            if let bool = result as? Bool { return bool ? "true" : "false" }
            // Only attempt JSON serialization on arrays/dicts
            if let obj = result, JSONSerialization.isValidJSONObject(obj),
               let data = try? JSONSerialization.data(withJSONObject: obj),
               let json = String(data: data, encoding: .utf8) {
                return String(json.prefix(2000))
            }
            return String(describing: result).prefix(2000).description
        } catch {
            return "JS error: \(error.localizedDescription)"
        }
    }

    // MARK: - Screenshot

    func takeScreenshot() async -> Data? {
        guard let webView = activeWebView else { return nil }
        let config = WKSnapshotConfiguration()
        // Small on purpose: it's only a fallback for when the agent is stuck, and full-size Retina
        // shots were ~640 KB, making every request ~860 KB. 640pt (1280px at 2x) is plenty to read.
        config.snapshotWidth = NSNumber(value: 640)

        return await withCheckedContinuation { continuation in
            #if os(macOS)
            webView.takeSnapshot(with: config) { image, _ in
                guard let image = image,
                      let tiff = image.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiff),
                      let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.5])
                else { continuation.resume(returning: nil); return }
                continuation.resume(returning: jpeg)
            }
            #else
            webView.takeSnapshot(with: config) { image, _ in
                guard let image = image else { continuation.resume(returning: nil); return }
                // Redraw into an opaque context to strip the alpha channel
                let format = UIGraphicsImageRendererFormat()
                format.opaque = true
                format.scale = 2  // not the screen's 3x; keeps the upload small
                let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
                let jpeg = renderer.jpegData(withCompressionQuality: 0.5) { ctx in
                    image.draw(at: .zero)
                }
                continuation.resume(returning: jpeg)
            }
            #endif
        }
    }

    // MARK: - Element Extraction

    func extractInteractiveElements() async -> [InteractiveElement] {
        guard let webView = activeWebView else { return [] }
        // Store references on window.__bisv_elements so click/type can find them by index
        let js = """
        (function() {
            var selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [onclick], [contenteditable="true"]';
            var els = Array.from(document.querySelectorAll(selectors));
            var results = []; var refs = []; var idx = 0;
            for (var el of els) {
                var rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
                if (rect.right < 0 || rect.left > window.innerWidth) continue;
                var style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') continue;
                refs.push(el);
                results.push({
                    tag: el.tagName.toLowerCase(),
                    text: (el.textContent || '').trim().slice(0, 80),
                    id: el.id || '', role: el.getAttribute('role') || '',
                    href: el.href || '', placeholder: el.placeholder || '',
                    boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y),
                                   width: Math.round(rect.width), height: Math.round(rect.height) },
                    index: idx
                });
                idx++;
            }
            window.__bisv_elements = refs;
            return JSON.stringify(results);
        })();
        """
        do {
            let result = try await webView.evaluateJavaScript(js)
            guard let jsonString = result as? String,
                  let data = jsonString.data(using: .utf8) else { return [] }
            return (try? JSONDecoder().decode([InteractiveElement].self, from: data)) ?? []
        } catch { return [] }
    }

    // MARK: - Page Info

    func getCurrentURL() -> String {
        activeWebView?.url?.absoluteString ?? "about:blank"
    }

    func getDisplayURL() -> String {
        guard let url = activeWebView?.url, url.absoluteString != "about:blank" else { return "" }
        return url.host ?? url.absoluteString
    }

    func getPageTitle() async -> String {
        guard let webView = activeWebView else { return "(unknown)" }
        return (try? await webView.evaluateJavaScript("document.title") as? String) ?? "(unknown)"
    }

    func getTabList() -> String {
        tabs.enumerated().map { i, tab in
            "[\(i)] \(webViews[tab.id]?.url?.absoluteString ?? tab.url)"
        }.joined(separator: ", ")
    }

    // MARK: - Tab-Targeted Methods (for sub-agents operating on a specific tab by ID)

    func webView(for tabID: UUID) -> WKWebView? {
        webViews[tabID]
    }

    @discardableResult
    func createBackgroundTab(url: String) -> BrowserTab {
        let tab = BrowserTab()
        tab.url = url
        tabs.append(tab)

        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let observer = ScrollObserver()
        scrollObservers[tab.id] = observer
        config.userContentController.add(observer, name: "scrollDir")
        config.userContentController.addUserScript(
            WKUserScript(source: scrollObserverJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = safariUserAgent

        #if os(macOS)
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .windowBackgroundColor
        #else
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        #endif

        webViews[tab.id] = webView
        // NOTE: does NOT change activeTabIndex

        if url != "about:blank", let parsed = URL(string: url) {
            webView.load(URLRequest(url: parsed))
        }

        return tab
    }

    func closeTab(id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        closeTab(at: index)
    }

    func navigate(to urlString: String, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        var finalURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !finalURL.contains("://") {
            if finalURL.contains(".") && !finalURL.contains(" ") {
                finalURL = "https://\(finalURL)"
            } else {
                finalURL = "https://www.google.com/search?q=\(finalURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? finalURL)"
            }
        }
        guard let url = URL(string: finalURL) else { return }
        webView.load(URLRequest(url: url))
        await waitForLoad(webView: webView)
    }

    func goBack(tabID: UUID) async {
        guard let webView = webViews[tabID], webView.canGoBack else { return }
        webView.goBack()
        await waitForLoad(webView: webView)
    }

    func scrollPage(direction: String, amount: Double, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        let dy = direction == "down" ? amount : -amount
        _ = try? await webView.evaluateJavaScript("window.scrollBy(0, \(dy));")
        await waitForDOMSettle(webView: webView, timeout: 1.5)
    }

    func clickElement(at element: InteractiveElement, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        let js = """
        (function() {
            var el = (window.__bisv_elements || [])[<IDX>];
            if (!el) { el = document.elementFromPoint(<CX>, <CY>); }
            if (!el) return 'no element found';

            // Handle native select elements
            if (el.tagName === 'SELECT') {
                el.focus();
                el.click();
                return 'select clicked: ' + el.tagName;
            }

            // Handle custom dropdowns (divs that act as dropdown triggers)
            if (el.getAttribute('role') === 'combobox' || el.classList.contains('dropdown') || el.classList.contains('select')) {
                el.focus();
                el.click();
                setTimeout(function() {
                    if (el.getAttribute('aria-expanded') === 'false') {
                        el.click();
                    }
                }, 50);
                return 'dropdown clicked: ' + el.tagName;
            }

            if (el) { el.click(); return 'clicked: ' + el.tagName; }
            return 'no element found';
        })();
        """
            .replacingOccurrences(of: "<IDX>", with: "\(element.index)")
            .replacingOccurrences(of: "<CX>", with: "\(element.centerX)")
            .replacingOccurrences(of: "<CY>", with: "\(element.centerY)")
        _ = try? await webView.evaluateJavaScript(js)
        await waitForLoad(webView: webView)
    }

    func typeText(element: InteractiveElement, text: String, pressEnter: Bool, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        let escapedText = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")

        let enterJS = pressEnter ? """
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            var form = el.closest('form');
            if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
        """ : ""

        let js = """
        (function() {
            var el = (window.__bisv_elements || [])[<IDX>];
            if (!el) { el = document.elementFromPoint(<CX>, <CY>); }
            if (!el) return 'no element found';
            if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable) {
                var inner = el.querySelector('input, textarea, [contenteditable="true"]');
                if (inner) el = inner;
            }
            el.focus(); el.click();
            if (el.isContentEditable) {
                el.textContent = ''; el.textContent = '<TEXT>';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                <ENTER_JS>
                return 'typed (contenteditable): ' + el.tagName;
            }
            el.value = '';
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
                      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) { setter.call(el, '<TEXT>'); } else { el.value = '<TEXT>'; }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            <ENTER_JS>
            return 'typed into: ' + el.tagName;
        })();
        """
            .replacingOccurrences(of: "<IDX>", with: "\(element.index)")
            .replacingOccurrences(of: "<CX>", with: "\(element.centerX)")
            .replacingOccurrences(of: "<CY>", with: "\(element.centerY)")
            .replacingOccurrences(of: "<TEXT>", with: escapedText)
            .replacingOccurrences(of: "<ENTER_JS>", with: enterJS)
        _ = try? await webView.evaluateJavaScript(js)
        if pressEnter { await waitForLoad(webView: webView) }
    }

    func evaluateJS(code: String, tabID: UUID) async -> String {
        guard let webView = webViews[tabID] else { return "Error: no web view for tab" }
        do {
            let result = try await webView.evaluateJavaScript(code)
            if result == nil || result is NSNull { return "null" }
            if let str = result as? String { return str }
            if let num = result as? NSNumber { return num.stringValue }
            if let bool = result as? Bool { return bool ? "true" : "false" }
            if let obj = result, JSONSerialization.isValidJSONObject(obj),
               let data = try? JSONSerialization.data(withJSONObject: obj),
               let json = String(data: data, encoding: .utf8) {
                return String(json.prefix(2000))
            }
            return String(describing: result).prefix(2000).description
        } catch {
            return "JS error: \(error.localizedDescription)"
        }
    }

    func extractInteractiveElements(tabID: UUID) async -> [InteractiveElement] {
        guard let webView = webViews[tabID] else { return [] }
        let js = """
        (function() {
            var selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [onclick], [contenteditable="true"]';
            var els = Array.from(document.querySelectorAll(selectors));
            var results = []; var refs = []; var idx = 0;
            for (var el of els) {
                var rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
                if (rect.right < 0 || rect.left > window.innerWidth) continue;
                var style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') continue;
                refs.push(el);
                results.push({
                    tag: el.tagName.toLowerCase(),
                    text: (el.textContent || '').trim().slice(0, 80),
                    id: el.id || '', role: el.getAttribute('role') || '',
                    href: el.href || '', placeholder: el.placeholder || '',
                    boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y),
                                   width: Math.round(rect.width), height: Math.round(rect.height) },
                    index: idx
                });
                idx++;
            }
            window.__bisv_elements = refs;
            return JSON.stringify(results);
        })();
        """
        do {
            let result = try await webView.evaluateJavaScript(js)
            guard let jsonString = result as? String,
                  let data = jsonString.data(using: .utf8) else { return [] }
            return (try? JSONDecoder().decode([InteractiveElement].self, from: data)) ?? []
        } catch { return [] }
    }

    func getCurrentURL(tabID: UUID) -> String {
        webViews[tabID]?.url?.absoluteString ?? "about:blank"
    }

    func getPageTitle(tabID: UUID) async -> String {
        guard let webView = webViews[tabID] else { return "(unknown)" }
        return (try? await webView.evaluateJavaScript("document.title") as? String) ?? "(unknown)"
    }

    func waitUntilLoaded(timeout: TimeInterval = 10, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        await waitForLoad(webView: webView, timeout: timeout)
    }

    func waitUntilSettled(timeout: TimeInterval = 3, tabID: UUID) async {
        guard let webView = webViews[tabID] else { return }
        await waitForDOMSettle(webView: webView, timeout: timeout)
    }

    // MARK: - Sync Tab State

    func updateTabState(tabID: UUID, title: String?, url: String?, isLoading: Bool) {
        guard let tab = tabs.first(where: { $0.id == tabID }) else { return }
        if let title = title, !title.isEmpty { tab.title = title }
        if let url = url { tab.url = url }
        tab.isLoading = isLoading
    }

    // MARK: - Private

    // MARK: - Public Wait Helpers

    /// Waits for the active webview to finish loading, then for DOM to settle.
    func waitUntilLoaded(timeout: TimeInterval = 10) async {
        guard let webView = activeWebView else { return }
        await waitForLoad(webView: webView, timeout: timeout)
    }

    /// Waits for DOM mutations to settle on the active webview.
    func waitUntilSettled(timeout: TimeInterval = 3) async {
        guard let webView = activeWebView else { return }
        await waitForDOMSettle(webView: webView, timeout: timeout)
    }

    private func waitForLoad(webView: WKWebView, timeout: TimeInterval = 10) async {
        let start = Date()
        // Wait for WKWebView to finish loading
        while webView.isLoading, Date().timeIntervalSince(start) < timeout {
            try? await Task.sleep(for: .milliseconds(150))
        }
        // Brief settle then check if DOM is still mutating
        try? await Task.sleep(for: .milliseconds(100))
        await waitForDOMSettle(webView: webView, timeout: max(0, timeout - Date().timeIntervalSince(start)))
    }

    /// Polls the DOM until no new mutations are detected for a short window, or timeout is reached.
    private func waitForDOMSettle(webView: WKWebView, timeout: TimeInterval = 3) async {
        let js = """
        (function() {
            if (!window.__bisv_mo) {
                window.__bisv_mo_changed = false;
                window.__bisv_mo = new MutationObserver(function() { window.__bisv_mo_changed = true; });
                window.__bisv_mo.observe(document.body || document.documentElement,
                    { childList: true, subtree: true });
            }
            var c = window.__bisv_mo_changed;
            window.__bisv_mo_changed = false;
            return c ? 'changed' : 'stable';
        })();
        """
        let start = Date()
        var stableCount = 0
        while Date().timeIntervalSince(start) < timeout {
            let result = (try? await webView.evaluateJavaScript(js)) as? String ?? "stable"
            if result == "stable" {
                stableCount += 1
                if stableCount >= 2 { return }
            } else {
                stableCount = 0
            }
            try? await Task.sleep(for: .milliseconds(150))
        }
    }
}
