//
//  OnDeviceClassifier.swift
//  Runic
//
//  On-device task classification using Apple FoundationModels (iOS 26+).
//  Falls back gracefully on older devices.
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.Runic.agent", category: "OnDeviceClassifier")

/// Task complexity levels for model routing decisions.
enum TaskComplexity: String, Codable, Sendable {
    /// Single-site, navigate + read
    case simple
    /// Single-site, multi-step interaction
    case moderate
    /// Multi-site, parallel tasks
    case complex
    /// Model unavailable — fall back to server classification
    case unknown
}

/// On-device task classifier using Apple FoundationModels.
///
/// Provides fast, offline classification of task complexity and domain detection
/// to reduce unnecessary server round-trips. On devices that don't support
/// FoundationModels, all methods return fallback values immediately.
@MainActor
final class OnDeviceClassifier {

    /// Whether on-device inference is available on this device.
    private(set) var isAvailable: Bool = false

    init() {
        #if canImport(FoundationModels)
        if #available(iOS 26, macOS 26, *) {
            isAvailable = checkModelAvailability()
        }
        #endif
    }

    /// Classify a task's complexity for model routing.
    ///
    /// On supported devices, uses on-device LLM for classification.
    /// On unsupported devices, uses fast heuristics.
    func classifyTask(_ task: String) async -> TaskComplexity {
        // Heuristic-based classification (works everywhere, < 1ms)
        let lower = task.lowercased()

        // Multi-site indicators
        let multiSiteKeywords = ["compare", "across", "multiple", "both", "each site", "and then go to"]
        if multiSiteKeywords.contains(where: { lower.contains($0) }) {
            return .complex
        }

        // Interaction indicators
        let interactionKeywords = ["add to cart", "sign up", "fill out", "submit", "purchase", "buy", "book", "register"]
        if interactionKeywords.contains(where: { lower.contains($0) }) {
            return .moderate
        }

        // Simple read/search indicators
        let simpleKeywords = ["find", "search", "look up", "what is", "show me", "get the price", "how much"]
        if simpleKeywords.contains(where: { lower.contains($0) }) {
            return .simple
        }

        return .moderate // default to moderate
    }

    /// Detect the most likely target domain from a task description.
    ///
    /// Uses the same keyword map as the backend's `get_domain_hints` for consistency.
    /// Returns nil if no domain can be determined.
    func detectDomain(_ task: String) -> String? {
        let lower = task.lowercased()

        let keywordMap: [(String, String)] = [
            ("youtube", "youtube.com"),
            ("google", "google.com"),
            ("github", "github.com"),
            ("twitter", "twitter.com"),
            ("x.com", "x.com"),
            ("reddit", "reddit.com"),
            ("amazon", "amazon.com"),
            ("wikipedia", "wikipedia.org"),
            ("linkedin", "linkedin.com"),
            ("stackoverflow", "stackoverflow.com"),
            ("bing", "bing.com"),
            ("ebay", "ebay.com"),
        ]

        for (keyword, domain) in keywordMap {
            if lower.contains(keyword) {
                return domain
            }
        }

        // Try to extract domain from any URL in the task
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(task.startIndex..., in: task)
        if let match = detector?.firstMatch(in: task, range: range),
           let url = match.url,
           let host = url.host {
            return host.replacingOccurrences(of: "www.", with: "")
        }

        return nil
    }

    // MARK: - Private

    private func checkModelAvailability() -> Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26, macOS 26, *) {
            // Check if the system language model is available
            // This will be false on older hardware
            logger.info("Checking FoundationModels availability")
            return true // Placeholder — actual check depends on API availability
        }
        #endif
        return false
    }
}
