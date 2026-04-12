//
//  Models.swift
//  BISV26
//
//  AI Browser Agent - Data models
//

import Foundation

// MARK: - Interactive Element (mirrors the JS extraction)

struct InteractiveElement: Codable, Identifiable {
    let tag: String
    let text: String
    let id: String
    let role: String
    let href: String
    let placeholder: String
    let boundingBox: BoundingBox
    let index: Int

    var label: String {
        let raw = text.isEmpty ? (placeholder.isEmpty ? (id.isEmpty ? href : id) : placeholder) : text
        return raw.isEmpty ? "(no label)" : String(raw.prefix(60))
    }

    var centerX: Double { boundingBox.x + boundingBox.width / 2 }
    var centerY: Double { boundingBox.y + boundingBox.height / 2 }
}

struct BoundingBox: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

// MARK: - Browser Tab

@Observable
final class BrowserTab: Identifiable {
    let id = UUID()
    var title: String = "New Tab"
    var url: String = "https://google.com/"
    var isLoading: Bool = false
}

// MARK: - Agent Log Entry

struct AgentLogEntry: Identifiable {
    enum Kind { case action, success, error, thinking, info }
    let id = UUID()
    let kind: Kind
    let message: String
    let timestamp = Date()
}

// MARK: - OpenAI API Types

struct ChatMessage: Codable {
    let role: String
    var content: AnyCodable? // string or array of content parts
    var tool_calls: [ToolCall]?
    var tool_call_id: String?
    var name: String?
}

struct ToolCall: Codable {
    let id: String
    let type: String
    let function: FunctionCall
}

struct FunctionCall: Codable {
    let name: String
    let arguments: String
}

struct ChatCompletionRequest: Codable {
    let model: String
    let messages: [ChatMessage]
    let tools: [ToolDefinition]
    let tool_choice: String
    let max_tokens: Int
}

struct ChatCompletionResponse: Codable {
    let choices: [Choice]
}

struct Choice: Codable {
    let message: ChatMessage
}

struct ToolDefinition: Codable {
    let type: String
    let function: FunctionDefinitionBody
}

struct FunctionDefinitionBody: Codable {
    let name: String
    let description: String
    let strict: Bool
    let parameters: JSONSchema
}

struct JSONSchema: Codable {
    let type: String
    var properties: [String: PropertySchema]?
    var required: [String]?
    let additionalProperties: Bool

    enum CodingKeys: String, CodingKey {
        case type, properties, required, additionalProperties
    }
}

final class PropertySchema: Codable {
    let type: String?
    var description: String?
    var `enum`: [String]?
    var items: PropertySchema?
    var properties: [String: PropertySchema]?
    var required: [String]?
    var additionalProperties: Bool?

    enum CodingKeys: String, CodingKey {
        case type, description, `enum`, items, properties, required, additionalProperties
    }

    // Convenience initializer for simple leaf schemas (no recursive fields)
    init(type: String?, description: String? = nil, enum: [String]? = nil) {
        self.type = type
        self.description = description
        self.enum = `enum`
        self.items = nil
        self.properties = nil
        self.required = nil
        self.additionalProperties = nil
    }

    // Full initializer with nested schema support
    init(type: String?, description: String? = nil, enum: [String]? = nil,
         items: PropertySchema? = nil, properties: [String: PropertySchema]? = nil,
         required: [String]? = nil, additionalProperties: Bool? = nil) {
        self.type = type
        self.description = description
        self.enum = `enum`
        self.items = items
        self.properties = properties
        self.required = required
        self.additionalProperties = additionalProperties
    }
}

// MARK: - Generic Codable wrapper

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let arr = try? container.decode([ContentPart].self) {
            value = arr
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            value = try container.decode(String.self)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let str = value as? String {
            try container.encode(str)
        } else if let parts = value as? [ContentPart] {
            try container.encode(parts)
        } else if let parts = value as? [[String: Any]] {
            // Encode as JSON array manually
            let data = try JSONSerialization.data(withJSONObject: parts)
            let raw = String(data: data, encoding: .utf8)!
            // Use raw JSON via JSONEncoder workaround
            try container.encode(RawJSON(json: raw))
        } else {
            try container.encodeNil()
        }
    }
}

struct RawJSON: Codable {
    let json: String

    init(json: String) { self.json = json }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        json = try container.decode(String.self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(json)
    }
}

struct ContentPart: Codable {
    let type: String
    var text: String?
    var image_url: ImageURL?
}

struct ImageURL: Codable {
    let url: String
    let detail: String?
}

// MARK: - Tool Argument Structs

struct ClickArgs: Codable { let elementIndex: Int }
struct TypeTextArgs: Codable { let elementIndex: Int; let text: String; let pressEnter: Bool }
struct ScrollArgs: Codable { let direction: String; let amount: Double }
struct NavigateArgs: Codable { let url: String }
struct WaitArgs: Codable { let seconds: Double }
struct NewTabArgs: Codable { let url: String }
struct SwitchTabArgs: Codable { let tabIndex: Int }
struct EvaluateJSArgs: Codable { let code: String }
struct DoneArgs: Codable { let result: String }
struct ForkTask: Codable { let url: String; let task: String }
struct ForkTasksArgs: Codable { let tasks: [ForkTask] }
