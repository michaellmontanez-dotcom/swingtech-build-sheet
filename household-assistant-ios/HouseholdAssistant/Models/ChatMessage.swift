import Foundation

/// A line in the visible transcript. Distinct from the Claude wire-format messages
/// in ClaudeModels.swift — this is purely what the UI renders.
struct ChatMessage: Identifiable, Equatable {
    enum Role { case user, assistant }

    let id = UUID()
    let role: Role
    var text: String
    let timestamp = Date()
}
