//
//  OpenAIService.swift
//  BISV26
//
//  Direct OpenAI API client — used as fallback when no backend is configured.
//  Tool definitions live on the backend; this keeps a copy for the direct path.
//

import Foundation
import os.log

private let logger = Logger(subsystem: "com.bisv26.agent", category: "OpenAIService")

final class OpenAIService {
    var apiKey: String
    var baseURL: String

    init(apiKey: String = Secrets.openAIAPIKey, baseURL: String = "https://api.openai.com/v1") {
        self.apiKey = apiKey
        self.baseURL = baseURL
    }

    // MARK: - Tool Definitions (fallback — backend has the canonical copy)

    static let tools: [ToolDefinition] = [
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "click",
            description: "Click the interactive element at the given index from the element list.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["elementIndex": PropertySchema(type: "number", description: "Index of the element to click")], required: ["elementIndex"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "type_text",
            description: "Click an input element, clear it, type the given text. Optionally press Enter after.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["elementIndex": PropertySchema(type: "number", description: "Index of the element to type into"), "text": PropertySchema(type: "string", description: "Text to type"), "pressEnter": PropertySchema(type: "boolean", description: "Whether to press Enter after typing")], required: ["elementIndex", "text", "pressEnter"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "scroll",
            description: "Scroll the page up or down by a given number of pixels.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["direction": PropertySchema(type: "string", description: "Scroll direction", enum: ["up", "down"]), "amount": PropertySchema(type: "number", description: "Pixels to scroll")], required: ["direction", "amount"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "navigate",
            description: "Navigate the browser to the given URL.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["url": PropertySchema(type: "string", description: "URL to navigate to")], required: ["url"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "wait",
            description: "Wait for a number of seconds (max 10) for dynamic content to load.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["seconds": PropertySchema(type: "number", description: "Seconds to wait (max 10)")], required: ["seconds"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "new_tab",
            description: "Open a new browser tab with the given URL and switch to it.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["url": PropertySchema(type: "string", description: "URL to open in the new tab")], required: ["url"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "switch_tab",
            description: "Switch to a browser tab by its index (0-based).",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["tabIndex": PropertySchema(type: "number", description: "Index of the tab to switch to")], required: ["tabIndex"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "go_back",
            description: "Navigate back in the browser history.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: [:], required: [], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "evaluate_js",
            description: "Execute arbitrary JavaScript in the page context and return the string result.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["code": PropertySchema(type: "string", description: "JavaScript code to evaluate.")], required: ["code"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "fork_tasks",
            description: "Run multiple browser tasks in parallel. Each task gets its own tab with a starting URL. All run concurrently and results are returned when all complete. Use when you need to gather info from multiple independent sites simultaneously.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: [
                "tasks": PropertySchema(
                    type: "array",
                    description: "Array of tasks to run in parallel (max 5)",
                    items: PropertySchema(
                        type: "object",
                        description: nil,
                        properties: [
                            "url": PropertySchema(type: "string", description: "Starting URL for this sub-task"),
                            "task": PropertySchema(type: "string", description: "Task description for the sub-agent")
                        ],
                        required: ["url", "task"],
                        additionalProperties: false
                    )
                )
            ], required: ["tasks"], additionalProperties: false)
        )),
        ToolDefinition(type: "function", function: FunctionDefinitionBody(
            name: "done",
            description: "Call this when the task is complete. Provide a summary.",
            strict: true,
            parameters: JSONSchema(type: "object", properties: ["result": PropertySchema(type: "string", description: "Summary of what was accomplished")], required: ["result"], additionalProperties: false)
        )),
    ]

    /// Tools available to sub-agents (no fork_tasks, new_tab, or switch_tab to prevent recursion/conflicts)
    static let subAgentTools: [ToolDefinition] = tools.filter {
        !["fork_tasks", "new_tab", "switch_tab"].contains($0.function.name)
    }

    // MARK: - Direct API Call

    func chatCompletion(messages: [[String: Any]], tools customTools: [ToolDefinition]? = nil) async throws -> ChatCompletionResponse {
        guard !apiKey.isEmpty else { throw OpenAIError.noAPIKey }

        let toolDicts = (customTools ?? OpenAIService.tools).map { tool -> [String: Any] in
            var params: [String: Any] = [
                "type": tool.function.parameters.type,
                "additionalProperties": tool.function.parameters.additionalProperties
            ]
            if let props = tool.function.parameters.properties {
                params["properties"] = props.mapValues { Self.propertySchemaToDict($0) }
            }
            if let req = tool.function.parameters.required {
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

        let body: [String: Any] = [
            "model": "gpt-4o-mini",
            "messages": messages,
            "tools": toolDicts,
            "tool_choice": "required",
            "max_tokens": 1024
        ]

        let url = URL(string: "\(baseURL)/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        let bodyData = try JSONSerialization.data(withJSONObject: body)
        request.httpBody = bodyData
        logger.debug("API request: \(bodyData.count) bytes, \(messages.count) messages")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenAIError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            let errorBody = String(data: data, encoding: .utf8) ?? "unknown"
            throw OpenAIError.apiError(statusCode: httpResponse.statusCode, message: errorBody)
        }

        // Parse response
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let messageDict = firstChoice["message"] as? [String: Any] else {
            throw OpenAIError.invalidResponse
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

    enum OpenAIError: LocalizedError {
        case noAPIKey
        case invalidResponse
        case apiError(statusCode: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .noAPIKey: return "OpenAI API key not set"
            case .invalidResponse: return "Invalid response from API"
            case .apiError(let code, let msg): return "API error (\(code)): \(msg)"
            }
        }
    }
}
