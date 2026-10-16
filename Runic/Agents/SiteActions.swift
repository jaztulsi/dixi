//
//  SiteActions.swift
//  Runic
//
//  Common commands done directly in the page: instant, no AI call, no tokens, no flaky
//  multi-step agent loop. "play the first video", "skip the ad", "add it to my cart",
//  "pause", "scroll down"... Anything not covered here still goes to the AI agent.
//

import Foundation

enum SiteActions {
    struct Match {
        let label: String  // shown in the caption, e.g. "Playing video 1"
        let js: String     // returns "ok: <message>" when done, "wait" if the page isn't ready yet
        /// How long to keep retrying while the page returns "wait": the page may still be loading
        /// (search results), or a YouTube ad's skip button may not be clickable yet.
        let patience: TimeInterval
    }

    static func match(_ command: String, url: String) -> Match? {
        let c = command.lowercased().trimmingCharacters(in: .whitespaces.union(.punctuationCharacters))
        let host = URL(string: url)?.host?.lowercased() ?? ""
        let onYouTube = host.hasSuffix("youtube.com")
        let onAmazon = host.contains("amazon.")
        let onGoogle = host.hasSuffix("google.com") && url.contains("/search")

        // "skip (the) ad(s)"
        if c.range(of: #"\bskip\b.*\bads?\b"#, options: .regularExpression) != nil {
            return Match(label: "Skipping ad", js: skipAdJS, patience: 8)
        }

        // "play / open / watch / click the first|2nd|last video|result|one"
        if let n = ordinal(in: c), c.range(of: #"\b(play|open|watch|click|tap|go to|select)\b"#, options: .regularExpression) != nil,
           c.range(of: #"\b(video|result|one|link|item|product|song)\b"#, options: .regularExpression) != nil {
            if onYouTube { return Match(label: "Playing video \(n.label)", js: openNth(youTubeVideosJS, n.index), patience: 6) }
            if onAmazon { return Match(label: "Opening result \(n.label)", js: openNth(amazonResultsJS, n.index), patience: 6) }
            if onGoogle { return Match(label: "Opening result \(n.label)", js: openNth(googleResultsJS, n.index), patience: 6) }
        }

        // "add it / this / the second one to (my) cart"
        if onAmazon, c.range(of: #"\badd\b.*\bto\b.*\bcart\b"#, options: .regularExpression) != nil {
            return Match(label: "Adding to cart", js: amazonAddToCartJS(ordinal(in: c)?.index), patience: 6)
        }

        // Media controls on any page with a video.
        let media: [(String, String, String)] = [
            (#"^(pause|stop)( (the )?(video|it|music))?$"#, "Paused", "v.pause()"),
            (#"^(play|resume|unpause)( (the )?(video|it|music))?$"#, "Playing", "v.play()"),
            (#"^(unmute|sound on)( (the )?(video|it))?$"#, "Unmuted", "v.muted = false"),
            (#"^(mute|sound off)( (the )?(video|it))?$"#, "Muted", "v.muted = true"),
        ]
        for (pattern, label, call) in media where c.range(of: pattern, options: .regularExpression) != nil {
            return Match(label: label, js: """
                (() => { const v = [...document.querySelectorAll('video')].find(v => v.offsetWidth > 0);
                  if (!v) return 'wait'; \(call); return 'ok: \(label)'; })()
                """, patience: 3)
        }

        // Page navigation on any site.
        let page: [(String, String, String)] = [
            (#"^scroll( (it|the page))? down$|^(page )?down$"#, "Scrolling down", "window.scrollBy({top: innerHeight * 0.8, behavior: 'smooth'})"),
            (#"^scroll( (it|the page))? up$|^(page )?up$"#, "Scrolling up", "window.scrollBy({top: -innerHeight * 0.8, behavior: 'smooth'})"),
            (#"^(scroll to the )?top$|^go to the top$"#, "Top of page", "window.scrollTo({top: 0, behavior: 'smooth'})"),
            (#"^go back$|^back$"#, "Going back", "history.back()"),
            (#"^go forward$|^forward$"#, "Going forward", "history.forward()"),
            (#"^(reload|refresh)( (the )?page)?$"#, "Reloading", "location.reload()"),
        ]
        for (pattern, label, call) in page where c.range(of: pattern, options: .regularExpression) != nil {
            return Match(label: label, js: "(() => { \(call); return 'ok: \(label)'; })()", patience: 0)
        }
        return nil
    }

    /// Runs a match, retrying while the page says "wait". Returns a short message for the caption.
    static func run(_ m: Match, on tabs: TabManager) async -> String {
        // A navigation dispatched a moment ago ("search lofi and play the first video") has to land
        // first, or the *old* page's first video gets played.
        try? await Task.sleep(for: .milliseconds(300))
        await tabs.waitUntilLoaded()
        let deadline = Date().addingTimeInterval(m.patience)
        while true {
            let r = await tabs.evaluateJS(code: m.js)
            if r.hasPrefix("ok") { return String(r.dropFirst(3)).trimmingCharacters(in: .whitespaces) }
            if r != "wait" { return "Couldn't do that here (\(r.prefix(60)))" }
            if Date() >= deadline { return "Couldn't find that on this page" }
            try? await Task.sleep(for: .milliseconds(400))
        }
    }

    // MARK: - Ordinals

    struct Ordinal { let index: Int; let label: String }  // index 0-based; -1 = last

    static func ordinal(in text: String) -> Ordinal? {
        let words: [(String, Int)] = [
            ("first", 0), ("1st", 0), ("top", 0), ("second", 1), ("2nd", 1), ("third", 2), ("3rd", 2),
            ("fourth", 3), ("4th", 3), ("fifth", 4), ("5th", 4), ("last", -1),
        ]
        for (word, i) in words where text.range(of: "\\b\(word)\\b", options: .regularExpression) != nil {
            return Ordinal(index: i, label: i < 0 ? "(last)" : "\(i + 1)")
        }
        // "video 2", "result number 3", "number two"
        let numbers = ["one": 1, "two": 2, "three": 3, "four": 4, "five": 5]
        if let r = text.range(of: #"\b(?:video|result|number|item)\s+(?:number\s+)?(\d|one|two|three|four|five)\b"#, options: .regularExpression) {
            let token = text[r].split(separator: " ").last.map(String.init) ?? ""
            if let n = Int(token) ?? numbers[token], n > 0 { return Ordinal(index: n - 1, label: "\(n)") }
        }
        return nil
    }

    // MARK: - Page scripts

    /// Visible result links in page order. Ads are excluded by the selectors.
    private static let youTubeVideosJS = """
        [...document.querySelectorAll('ytd-video-renderer a#video-title, ytd-rich-item-renderer a#video-title-link, ytd-compact-video-renderer a#thumbnail')]
          .filter(a => a.href && a.href.includes('/watch') && a.offsetParent !== null)
        """
    private static let amazonResultsJS = """
        [...document.querySelectorAll('div[data-component-type="s-search-result"]')]
          .map(r => r.querySelector('h2 a, a.a-link-normal.s-link-style, a:has(h2)'))
          .filter(a => a && a.href)
        """
    private static let googleResultsJS = """
        [...document.querySelectorAll('#search a:has(h3)')].filter(a => a.href && a.offsetParent !== null)
        """

    /// Navigates to the nth link's href. Navigating (instead of a synthetic click) is reliable on
    /// single-page apps like YouTube, where the agent's clicks often did nothing.
    private static func openNth(_ listJS: String, _ index: Int) -> String {
        """
        (() => { const list = \(listJS);
          if (list.length === 0) return 'wait';
          const a = \(index) < 0 ? list[list.length - 1] : list[\(index)];
          if (!a) return 'ok: only ' + list.length + ' results here';
          location.href = a.href; return 'ok: ' + (a.textContent || '').trim().slice(0, 80); })()
        """
    }

    private static let skipAdJS = """
        (() => { const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button[id^="skip-button"]');
          if (b && b.offsetParent !== null) { b.click(); return 'ok: ad skipped'; }
          const adShowing = document.querySelector('.ad-showing');
          return adShowing ? 'wait' : 'ok: no ad playing'; })()
        """

    /// Product page: its Add to Cart button. Results page: the nth result's button.
    private static func amazonAddToCartJS(_ index: Int?) -> String {
        """
        (() => { const page = document.querySelector('#add-to-cart-button');
          if (page && \(index == nil ? "true" : "false")) { page.click(); return 'ok: added to cart'; }
          const results = [...document.querySelectorAll('div[data-component-type="s-search-result"]')]
            .map(r => r.querySelector('button[name="submit.addToCart"], [aria-label^="Add to cart"], [aria-label^="Add to Cart"]'))
            .filter(Boolean);
          if (page) { page.click(); return 'ok: added to cart'; }
          if (results.length === 0) return 'wait';
          const i = \(index ?? 0); const b = i < 0 ? results[results.length - 1] : results[i];
          if (!b) return 'ok: only ' + results.length + ' results with an Add to cart button';
          b.click(); return 'ok: added result ' + (i < 0 ? 'last' : i + 1) + ' to cart'; })()
        """
    }
}
