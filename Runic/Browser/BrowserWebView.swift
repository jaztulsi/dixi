//
//  BrowserWebView.swift
//  BISV26
//
//  Platform-adaptive WKWebView wrapper for SwiftUI
//

import SwiftUI
import WebKit

#if os(macOS)

struct BrowserWebView: NSViewRepresentable {
    let webView: WKWebView
    let tabID: UUID
    let tabManager: TabManager

    func makeNSView(context: Context) -> NSView {
        let container = NSView()
        container.autoresizesSubviews = true
        embed(webView, in: container, context: context)
        return container
    }

    func updateNSView(_ container: NSView, context: Context) {
        // If the active web view changed, swap it in
        if let current = container.subviews.first as? WKWebView, current !== webView {
            current.removeFromSuperview()
            embed(webView, in: container, context: context)
        }
    }

    private func embed(_ wv: WKWebView, in container: NSView, context: Context) {
        wv.navigationDelegate = context.coordinator
        wv.frame = container.bounds
        wv.autoresizingMask = [.width, .height]
        container.addSubview(wv)
        context.coordinator.tabID = tabID
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(tabID: tabID, tabManager: tabManager)
    }
}

#else

struct BrowserWebView: UIViewRepresentable {
    let webView: WKWebView
    let tabID: UUID
    let tabManager: TabManager

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.autoresizesSubviews = true
        embed(webView, in: container, context: context)
        return container
    }

    func updateUIView(_ container: UIView, context: Context) {
        if let current = container.subviews.first as? WKWebView, current !== webView {
            current.removeFromSuperview()
            embed(webView, in: container, context: context)
        }
    }

    private func embed(_ wv: WKWebView, in container: UIView, context: Context) {
        wv.navigationDelegate = context.coordinator
        wv.frame = container.bounds
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(wv)
        context.coordinator.tabID = tabID
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(tabID: tabID, tabManager: tabManager)
    }
}

#endif

extension BrowserWebView {
    final class Coordinator: NSObject, WKNavigationDelegate {
        var tabID: UUID
        let tabManager: TabManager

        init(tabID: UUID, tabManager: TabManager) {
            self.tabID = tabID
            self.tabManager = tabManager
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in
                tabManager.updateTabState(tabID: tabID, title: nil, url: webView.url?.absoluteString, isLoading: true)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                tabManager.updateTabState(tabID: tabID, title: webView.title, url: webView.url?.absoluteString, isLoading: false)
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                tabManager.updateTabState(tabID: tabID, title: webView.title, url: webView.url?.absoluteString, isLoading: false)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            preferences: WKWebpagePreferences,
            decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
        ) {
            // Force all navigation to stay in this web view — never open external apps
            let prefs = preferences
            prefs.preferredContentMode = .mobile
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download, prefs)
            } else {
                // .cancel + load manually prevents universal link handoff
                if navigationAction.navigationType == .linkActivated,
                   let url = navigationAction.request.url {
                    webView.load(URLRequest(url: url))
                    decisionHandler(.cancel, prefs)
                } else {
                    decisionHandler(.allow, prefs)
                }
            }
        }
    }
}
