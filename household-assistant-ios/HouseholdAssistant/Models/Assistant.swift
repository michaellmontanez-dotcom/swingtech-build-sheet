import Foundation

/// The two people in the household.
enum Person: String, Codable, CaseIterable, Identifiable {
    case michael
    case michelle

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .michael: return "Michael"
        case .michelle: return "Michelle"
        }
    }
}

/// Work vs Home compartment. Determines context isolation: a Work assistant and a
/// Home assistant never share conversation history, even for the same person.
enum Scope: String, Codable {
    case work
    case home
}

/// The four assistants. Each has its own wake word, voice, persona, and scoped
/// context. They are compartmentalized but all read the shared household calendar
/// for conflict detection.
enum Assistant: String, Codable, CaseIterable, Identifiable {
    case jarvis   // Michael · Work
    case snarf    // Michael · Home
    case school   // Michelle · Work
    case home     // Michelle · Home

    var id: String { rawValue }

    var person: Person {
        switch self {
        case .jarvis, .snarf: return .michael
        case .school, .home:  return .michelle
        }
    }

    var scope: Scope {
        switch self {
        case .jarvis, .school: return .work
        case .snarf, .home:    return .home
        }
    }

    /// Spoken wake word the user says after "Hey Siri, …".
    /// Michelle's wake words are provisional pending Michael's confirmation.
    var wakeWord: String {
        switch self {
        case .jarvis: return "Jarvis"
        case .snarf:  return "Snarf"
        case .school: return "School"
        case .home:   return "Home"
        }
    }

    var displayName: String { wakeWord }

    /// Resolve an assistant from a spoken/typed wake word (case-insensitive).
    static func matching(wakeWord: String) -> Assistant? {
        let needle = wakeWord.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return Assistant.allCases.first { $0.wakeWord.lowercased() == needle }
    }
}
