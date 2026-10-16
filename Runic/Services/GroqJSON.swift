//
//  GroqJSON.swift
//  Runic
//
//  One place for small JSON-mode Groq calls (voice intent, page Q&A) and for the per-model
//  rate-limit cooldowns every Groq caller shares.
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.bisv26.agent", category: "GroqJSON")

enum GroqJSON {
    /// "Rate limited until" per model, shared by the agent, voice and Q&A, so a model Groq just
    /// refused is skipped until it frees up instead of being asked again.
    private static var cooldownUntil: [String: Date] = [:]

    static func noteRateLimit(_ model: String, retryAfter: String?) {
        cooldownUntil[model] = Date().addingTimeInterval(min(Double(retryAfter ?? "") ?? 10, 60))
    }

    static func isCoolingDown(_ model: String) -> Bool { (cooldownUntil[model] ?? .distantPast) > Date() }

    /// Seconds until the first of `models` is usable again (1...30).
    static func secondsUntilAnyFree(_ models: [String]) -> Double {
        let soonest = models.map { cooldownUntil[$0] ?? .distantPast }.min() ?? .distantPast
        return min(30, max(1, soonest.timeIntervalSinceNow))
    }

    /// One JSON-mode chat completion. Tries `models` in order, skipping ones in cooldown.
    /// Returns the message content, or nil (logged) on failure or when every model is limited.
    static func complete(system: String, user: String, models: [String],
                         maxTokens: Int = 500, timeout: TimeInterval = 15) async -> String? {
        guard let url = URL(string: "\(LLMService.groqBaseURL)/chat/completions") else { return nil }
        for model in models where !isCoolingDown(model) {
            var body: [String: Any] = [
                "model": model,
                "messages": [["role": "system", "content": system], ["role": "user", "content": user]],
                "response_format": ["type": "json_object"],
                "max_tokens": maxTokens,
                "temperature": 0,
            ]
            if let effort = LLMService.reasoningEffort(for: model) { body["reasoning_effort"] = effort }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.addValue("Bearer \(Secrets.groqAPIKey)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = timeout
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  let http = response as? HTTPURLResponse else { return nil }
            if http.statusCode == 429 {
                noteRateLimit(model, retryAfter: http.value(forHTTPHeaderField: "retry-after"))
                logger.warning("\(model, privacy: .public) rate limited, trying next")
                continue
            }
            guard http.statusCode == 200 else {
                logger.error("\(model, privacy: .public) API \(http.statusCode): \(String(data: data, encoding: .utf8) ?? "", privacy: .public)")
                return nil
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let message = choices.first?["message"] as? [String: Any] else { return nil }
            return message["content"] as? String
        }
        return nil
    }
}
