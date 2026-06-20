import Foundation

/// Drives the conversation for ONE assistant: holds that assistant's isolated
/// message history and runs the Claude tool-use loop. Work and Home assistants
/// each own a separate engine, so their context never mixes.
actor ConversationEngine {
    let assistant: Assistant
    private let profile: AssistantProfile
    private let tools: AssistantTools
    private let client = ClaudeClient()
    private var messages: [ClaudeMessage] = []

    /// Safety cap on the tool-call loop to avoid runaway round-trips.
    private let maxToolRounds = 6

    init(assistant: Assistant) {
        self.assistant = assistant
        self.profile = AssistantProfile.profile(for: assistant)
        self.tools = AssistantTools(assistant: assistant)
    }

    /// Send a user utterance, run any tool calls, and return the spoken reply text.
    func respond(to userText: String) async throws -> String {
        messages.append(ClaudeMessage(role: "user", content: [.text(userText)]))

        for _ in 0..<maxToolRounds {
            let response = try await client.send(
                system: profile.systemPrompt,
                messages: messages,
                tools: tools.definitions)

            // Record the assistant turn. Preserve tool_use blocks; drop empty text
            // blocks, which the API rejects when echoed back.
            let assistantContent = response.content.filter { block in
                if case let .text(t) = block {
                    return !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                }
                return true
            }
            messages.append(ClaudeMessage(role: "assistant", content: assistantContent))

            if response.stop_reason == "tool_use" {
                let results = await runTools(in: response.content)
                messages.append(ClaudeMessage(role: "user", content: results))
                continue // let the model see results and finish (or call more tools)
            }

            return spokenText(from: response.content)
        }

        return "Sorry, that took too many steps. Let's try again."
    }

    /// Clear history — called when the assistant sleeps, so the next activation starts fresh.
    func reset() {
        messages.removeAll()
    }

    // MARK: - Helpers

    private func runTools(in content: [ContentBlock]) async -> [ContentBlock] {
        var results: [ContentBlock] = []
        for block in content {
            if case let .toolUse(id, name, input) = block {
                let (text, isError) = await tools.execute(name: name, input: input)
                results.append(.toolResult(toolUseID: id, content: text, isError: isError))
            }
        }
        return results
    }

    private func spokenText(from content: [ContentBlock]) -> String {
        let text = content.compactMap { block -> String? in
            if case let .text(t) = block { return t }
            return nil
        }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)

        return text.isEmpty ? "Done." : text
    }
}
