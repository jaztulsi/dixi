//
//  SiteCacheImpl.swift
//  Runic
//
//  Implements the SiteCache protocol from BrowserAgent.swift.
//  Stores URL history per task keyword for quick re-navigation.
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.Runic.agent", category: "SiteCache")

/// Persisted site cache that stores URL patterns learned from previous tasks.
///
/// When a user runs a task like "search amazon for keyboards", the cache records
/// that amazon.com was visited. On future similar tasks, `directURL(for:)` can
/// return a direct URL to skip the initial navigation step.
@MainActor
final class SiteCacheImpl: SiteCache {

    private static let storageKey = "com.Runic.siteCache.urlHistory"
    private static let maxEntriesPerKeyword = 5

    /// keyword -> [URLs visited for that keyword, most recent first]
    private var urlHistory: [String: [String]]

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.storageKey),
           let decoded = try? JSONDecoder().decode([String: [String]].self, from: data) {
            self.urlHistory = decoded
        } else {
            self.urlHistory = [:]
        }
        logger.info("SiteCache loaded with \(self.urlHistory.count) keyword entries")
    }

    /// Returns a direct URL for a task if one has been previously visited.
    ///
    /// Extracts keywords from the task and checks if any have associated URLs.
    /// Returns the most recently visited URL for the best-matching keyword.
    func directURL(for task: String) -> String? {
        let keywords = extractKeywords(from: task)
        for keyword in keywords {
            if let urls = urlHistory[keyword], let url = urls.first {
                logger.debug("Cache hit: \(keyword) -> \(url)")
                return url
            }
        }
        return nil
    }

    /// Record that a URL was visited during a task.
    ///
    /// Associates the URL with each keyword in the task for future lookups.
    func recordVisit(task: String, url: String) {
        let keywords = extractKeywords(from: task)
        for keyword in keywords {
            var urls = urlHistory[keyword] ?? []

            // Remove duplicate if exists
            urls.removeAll { $0 == url }

            // Insert at front (most recent)
            urls.insert(url, at: 0)

            // Limit history size
            if urls.count > Self.maxEntriesPerKeyword {
                urls = Array(urls.prefix(Self.maxEntriesPerKeyword))
            }

            urlHistory[keyword] = urls
        }
        persist()
    }

    // MARK: - Private

    /// Extract meaningful keywords from a task string.
    /// Filters out common stop words and short words.
    private func extractKeywords(from task: String) -> [String] {
        let stopWords: Set<String> = [
            "the", "and", "for", "that", "this", "with", "from", "are",
            "was", "have", "has", "had", "not", "but", "can", "will",
            "just", "about", "into", "some", "them", "then", "than",
            "find", "search", "look", "show", "get", "give", "tell",
            "please", "want", "need", "would", "could", "should",
        ]

        return task
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 2 && !stopWords.contains($0) }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(urlHistory) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }
}
