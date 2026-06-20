import Foundation

enum ClaudeClientError: LocalizedError {
    case missingAPIKey
    case http(status: Int, message: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Claude API key is missing. Set CLAUDE_API_KEY in Secrets.xcconfig."
        case let .http(status, message):
            return "Claude API error \(status): \(message)"
        case let .decoding(detail):
            return "Could not read Claude response: \(detail)"
        }
    }
}

/// Thin URLSession wrapper around the Claude Messages API. Swift has no official
/// Anthropic SDK, so this calls the REST endpoint directly.
struct ClaudeClient {
    private let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    private let session = URLSession.shared

    /// Sends one request and returns the assistant's response. The tool-use loop
    /// lives in ConversationEngine, which calls this repeatedly.
    func send(
        system: String,
        messages: [ClaudeMessage],
        tools: [ClaudeTool]
    ) async throws -> ClaudeResponse {
        let apiKey = Secrets.shared.claudeAPIKey
        guard !apiKey.isEmpty else { throw ClaudeClientError.missingAPIKey }

        let body = ClaudeRequest(
            model: AppConfig.claudeModel,
            max_tokens: AppConfig.claudeMaxTokens,
            system: system,
            messages: messages,
            tools: tools.isEmpty ? nil : tools,
            thinking: AppConfig.claudeUseAdaptiveThinking ? ClaudeThinking(type: "adaptive") : nil
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(AppConfig.claudeAPIVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ClaudeClientError.http(status: -1, message: "No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ClaudeErrorResponse.self, from: data))?
                .error.message ?? String(data: data, encoding: .utf8) ?? "Unknown error"
            throw ClaudeClientError.http(status: http.statusCode, message: message)
        }

        do {
            return try JSONDecoder().decode(ClaudeResponse.self, from: data)
        } catch {
            throw ClaudeClientError.decoding(error.localizedDescription)
        }
    }
}
