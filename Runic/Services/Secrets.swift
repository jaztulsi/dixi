//
//  Secrets.swift
//  Runic
//
//  API keys, read from the `.env` file at the repo root.
//  The "Copy .env" build phase bundles it as env.txt.
//

import Foundation

enum Secrets {
    static let groqAPIKey = env["GROQ_API_KEY"] ?? ""
    static let deepgramAPIKey = env["DEEPGRAM_API_KEY"] ?? ""

    // Groq retires preview models often, so these can be overridden in .env.
    /// Browser agent: needs tool calls + image input (screenshots when stuck).
    static let agentModel = nonEmpty(env["AGENT_MODEL"]) ?? "qwen/qwen3.8-27b"
    /// Voice agent: fast JSON-mode intent checks.
    static let voiceModel = nonEmpty(env["VOICE_MODEL"]) ?? "openai/gpt-oss-20b"

    private static func nonEmpty(_ s: String?) -> String? { s?.isEmpty == false ? s : nil }

    private static let env: [String: String] = {
        guard let url = Bundle.main.url(forResource: "env", withExtension: "txt"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [:] }
        return parse(text)
    }()

    /// Parses `KEY=value` lines. Skips blanks and `#` comments, strips `export ` and surrounding quotes.
    static func parse(_ text: String) -> [String: String] {
        var result: [String: String] = [:]
        for rawLine in text.split(whereSeparator: \.isNewline) {
            var line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("export ") { line.removeFirst("export ".count) }
            guard !line.hasPrefix("#"), let eq = line.firstIndex(of: "=") else { continue }
            let key = line[..<eq].trimmingCharacters(in: .whitespaces)
            var value = line[line.index(after: eq)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2, let q = value.first, q == "\"" || q == "'", value.last == q {
                value = String(value.dropFirst().dropLast())
            }
            result[key] = value
        }
        return result
    }
}
