//
//  LLMService.swift
//  Runic
//
//  Groq chat-completions client (OpenAI-compatible API) and the browser agent's tool definitions.
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.bisv26.agent", category: "LLMService")

final class LLMService {
    static let groqBaseURL = "https://api.groq.com/openai/v1"

    var apiKey: String
    var baseURL: String
    /// Called with the wait in seconds when Groq rate-limits a request, so the UI can say why it paused.
    var onRateLimit: (@MainActor (Int) -> Void)?

    init(apiKey: String = Secrets.groqAPIKey, baseURL: String = LLMService.groqBaseURL) {
        self.apiKey = apiKey
        self.baseURL = baseURL
    }

    // MARK: - Tool Definitions

    // Kept terse on purpose: tool schemas are resent on every agent step and count against the
    // free tier's tokens/min. Property names are self-explanatory, so most have no description.
    static let tools: [ToolDefinition] = [
        tool("click", "Click element by index.",
             ["elementIndex": PropertySchema(type: "number", description: nil)]),
        tool("type_text", "Replace an input's text; pressEnter submits.",
             ["elementIndex": PropertySchema(type: "number", description: nil),
              "text": PropertySchema(type: "string", description: nil),
              "pressEnter": PropertySchema(type: "boolean", description: nil)]),
        tool("scroll", "Scroll the page.",
             ["direction": PropertySchema(type: "string", description: nil, enum: ["up", "down"]),
              "amount": PropertySchema(type: "number", description: "pixels")]),
        tool("navigate", "Go to a URL.",
             ["url": PropertySchema(type: "string", description: nil)]),
        tool("wait", "Wait for content to load (max 10s).",
             ["seconds": PropertySchema(type: "number", description: nil)]),
        tool("new_tab", "Open a URL in a new tab.",
             ["url": PropertySchema(type: "string", description: nil)]),
        tool("switch_tab", "Switch tab by 0-based index.",
             ["tabIndex": PropertySchema(type: "number", description: nil)]),
        tool("go_back", "Browser back.", [:]),
        tool("evaluate_js", "Run JavaScript in the page; returns the result as text.",
             ["code": PropertySchema(type: "string", description: nil)]),
        tool("fork_tasks", "Run independent tasks in parallel, each in its own tab (max 5).",
             ["tasks": PropertySchema(type: "array", description: nil, items: PropertySchema(
                type: "object", description: nil,
                properties: ["url": PropertySchema(type: "string", description: "start URL"),
                             "task": PropertySchema(type: "string", description: nil)],
                required: ["url", "task"], additionalProperties: false))]),
        tool("done", "Task complete; give a short summary.",
             ["result": PropertySchema(type: "string", description: nil)]),
    ]

    private static func tool(_ name: String, _ description: String, _ props: [String: PropertySchema]) -> ToolDefinition {
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: name, description: description, strict: true,
            parameters: JSONSchema(type: "object", properties: props, required: props.keys.sorted(), additionalProperties: false)
        ))
    }

    /// Tools available to sub-agents (no fork_tasks, new_tab, or switch_tab to prevent recursion/conflicts)
    static let subAgentTools: [ToolDefinition] = tools.filter {
        !["fork_tasks", "new_tab", "switch_tab"].contains($0.function.name)
    }

    // MARK: - Direct API Call

    func chatCompletion(messages: [[String: Any]], tools customTools: [ToolDefinition]? = nil) async throws -> ChatCompletionResponse {
        guard !apiKey.isEmpty else { throw LLMError.noAPIKey }

        let toolDicts = Self.toolDicts(customTools ?? LLMService.tools)
        let compacted = Self.compactingOldPages(messages)

        func send(model: String) async throws -> (Data, URLResponse) {
            var body: [String: Any] = [
                "model": model,
                // Text-only fallbacks get the page snapshot without the screenshot instead of a 400.
                "messages": Self.readsImages(model) ? compacted : Self.strippingImages(compacted),
                "tools": toolDicts,
                "tool_choice": "required",
                "max_tokens": 1024
            ]
            if let effort = Self.reasoningEffort(for: model) { body["reasoning_effort"] = effort }

            var request = URLRequest(url: URL(string: "\(baseURL)/chat/completions")!)
            request.httpMethod = "POST"
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 120
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            logger.debug("API request: \(model), \(request.httpBody?.count ?? 0) bytes")
            return try await URLSession.shared.data(for: request)
        }

        // Groq's free tier gives each model its own ~8k tokens/min. On 429, move to the next model
        // with budget left; only wait (and tell the UI) when every candidate is limited.
        var (data, response) = (Data(), URLResponse())
        rounds: for round in 0..<3 {
            var wait = 30.0
            for model in Self.candidateModels {
                (data, response) = try await send(model: model)
                guard let http = response as? HTTPURLResponse, http.statusCode == 429 else { break rounds }
                wait = min(wait, Double(http.value(forHTTPHeaderField: "retry-after") ?? "") ?? 10)
                logger.warning("\(model) rate limited")
            }
            guard round < 2 else { break }
            await onRateLimit?(Int(wait))
            try await Task.sleep(for: .seconds(wait))
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            let errorBody = String(data: data, encoding: .utf8) ?? "unknown"
            throw LLMError.apiError(statusCode: httpResponse.statusCode, message: errorBody)
        }

        // Parse response
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let messageDict = firstChoice["message"] as? [String: Any] else {
            throw LLMError.invalidResponse
        }

        let role = messageDict["role"] as? String ?? "assistant"
        let content = messageDict["content"] as? String

        var toolCalls: [ToolCall]? = nil
        if let tcArray = messageDict["tool_calls"] as? [[String: Any]] {
            toolCalls = tcArray.compactMap { tc in
                guard let id = tc["id"] as? String,
                      let type = tc["type"] as? String,
                      let fn = tc["function"] as? [String: Any],
                      let name = fn["name"] as? String,
                      let args = fn["arguments"] as? String else { return nil }
                return ToolCall(id: id, type: type, function: FunctionCall(name: name, arguments: args))
            }
        }

        let msg = ChatMessage(
            role: role,
            content: content.map { AnyCodable($0) },
            tool_calls: toolCalls,
            tool_call_id: nil,
            name: nil
        )

        return ChatCompletionResponse(choices: [Choice(message: msg)])
    }

    private static func propertySchemaToDict(_ prop: PropertySchema) -> [String: Any] {
        var pd: [String: Any] = [:]
        if let t = prop.type { pd["type"] = t }
        if let d = prop.description { pd["description"] = d }
        if let e = prop.enum { pd["enum"] = e }
        if let items = prop.items { pd["items"] = propertySchemaToDict(items) }
        if let props = prop.properties { pd["properties"] = props.mapValues { propertySchemaToDict($0) } }
        if let req = prop.required { pd["required"] = req }
        if let addl = prop.additionalProperties { pd["additionalProperties"] = addl }
        return pd
    }

    static func toolDicts(_ tools: [ToolDefinition]) -> [[String: Any]] {
        tools.map { tool in
            var params: [String: Any] = [
                "type": tool.function.parameters.type,
                "additionalProperties": tool.function.parameters.additionalProperties
            ]
            params["properties"] = (tool.function.parameters.properties ?? [:]).mapValues { Self.propertySchemaToDict($0) }
            // Groq rejects "required" when there are no properties (e.g. go_back), even if it's empty.
            if let req = tool.function.parameters.required, !req.isEmpty {
                params["required"] = req
            }
            return [
                "type": "function",
                "function": [
                    "name": tool.function.name,
                    "description": tool.function.description,
                    "strict": true,
                    "parameters": params
                ] as [String: Any]
            ]
        }
    }

    /// Models to try in order, each with its own free-tier budget.
    static var candidateModels: [String] {
        [Secrets.agentModel] + ["openai/gpt-oss-120b", "openai/gpt-oss-20b"].filter { $0 != Secrets.agentModel }
    }

    /// Only Qwen reads images on Groq. Rather than wait out its rate limit (30s+ seen) for a
    /// screenshot, the other models get the same request as text: the element list is still there.
    static func readsImages(_ model: String) -> Bool { model.hasPrefix("qwen/") }

    static func strippingImages(_ messages: [[String: Any]]) -> [[String: Any]] {
        messages.map { m in
            guard let parts = m["content"] as? [[String: Any]] else { return m }
            var copy = m
            copy["content"] = parts.filter { $0["type"] as? String != "image_url" }
            return copy
        }
    }

    /// Keeps reasoning models from spending latency and max_tokens on thinking. nil = model doesn't take the param.
    static func reasoningEffort(for model: String) -> String? {
        if model.hasPrefix("qwen/") { return "none" }       // hybrid model: "none" = instruct mode
        if model.hasPrefix("openai/gpt-oss") { return "low" } // always reasons; "low" is the minimum
        return nil
    }

    /// Only the newest page snapshot is sent in full. Older user (page-state) messages shrink to their
    /// URL + title lines and lose their screenshots. Keeps each step under Groq's free-tier token/min limit
    /// and its 3-images-per-request cap; the task lives in the system prompt, so nothing essential is lost.
    static func compactingOldPages(_ messages: [[String: Any]]) -> [[String: Any]] {
        guard let latest = messages.lastIndex(where: { $0["role"] as? String == "user" }) else { return messages }
        return messages.enumerated().map { i, m in
            guard i != latest, m["role"] as? String == "user" else { return m }
            let text = (m["content"] as? String)
                ?? (m["content"] as? [[String: Any]])?.compactMap { $0["text"] as? String }.joined(separator: "\n")
                ?? ""
            var short = m
            short["content"] = text.split(separator: "\n").prefix(2).joined(separator: "\n") + "\n(older page snapshot trimmed)"
            return short
        }
    }

    enum LLMError: LocalizedError {
        case noAPIKey
        case invalidResponse
        case apiError(statusCode: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .noAPIKey: return "GROQ_API_KEY is not set in .env"
            case .invalidResponse: return "Invalid response from API"
            case .apiError(let code, let msg): return "API error (\(code)): \(msg)"
            }
        }
    }
}
