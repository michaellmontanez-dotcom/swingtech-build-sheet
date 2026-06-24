import Foundation

// Wire-format types for the Claude Messages API (/v1/messages).

struct ClaudeTool: Encodable {
    let name: String
    let description: String
    let input_schema: JSONValue
}

struct ClaudeThinking: Encodable {
    let type: String // "adaptive"
}

struct ClaudeRequest: Encodable {
    let model: String
    let max_tokens: Int
    let system: String?
    var messages: [ClaudeMessage]
    let tools: [ClaudeTool]?
    let thinking: ClaudeThinking?
}

struct ClaudeMessage: Codable {
    let role: String // "user" | "assistant"
    let content: [ContentBlock]
}

/// A content block in a request or response. We model the three kinds this app
/// uses: text, tool_use (from the model), and tool_result (back to the model).
enum ContentBlock: Codable {
    case text(String)
    case toolUse(id: String, name: String, input: JSONValue)
    case toolResult(toolUseID: String, content: String, isError: Bool)

    private enum CodingKeys: String, CodingKey {
        case type, text, id, name, input
        case toolUseID = "tool_use_id"
        case content
        case isError = "is_error"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "text":
            self = .text(try c.decode(String.self, forKey: .text))
        case "tool_use":
            self = .toolUse(
                id: try c.decode(String.self, forKey: .id),
                name: try c.decode(String.self, forKey: .name),
                input: try c.decode(JSONValue.self, forKey: .input))
        case "tool_result":
            self = .toolResult(
                toolUseID: try c.decode(String.self, forKey: .toolUseID),
                content: (try? c.decode(String.self, forKey: .content)) ?? "",
                isError: (try? c.decode(Bool.self, forKey: .isError)) ?? false)
        default:
            // Thinking / other server block types we don't render — keep as empty text.
            self = .text("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .text(text):
            try c.encode("text", forKey: .type)
            try c.encode(text, forKey: .text)
        case let .toolUse(id, name, input):
            try c.encode("tool_use", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(name, forKey: .name)
            try c.encode(input, forKey: .input)
        case let .toolResult(toolUseID, content, isError):
            try c.encode("tool_result", forKey: .type)
            try c.encode(toolUseID, forKey: .toolUseID)
            try c.encode(content, forKey: .content)
            try c.encode(isError, forKey: .isError)
        }
    }
}

struct ClaudeResponse: Decodable {
    let content: [ContentBlock]
    let stop_reason: String?
}

/// Decoded shape of an API error body, e.g. {"error":{"type":...,"message":...}}.
struct ClaudeErrorResponse: Decodable {
    struct APIError: Decodable { let type: String; let message: String }
    let error: APIError
}
