import AppIntents

/// App Intents enum mirroring the four assistants, so each can be exposed to Siri
/// and the Shortcuts app.
enum AssistantChoice: String, AppEnum {
    case jarvis, snarf, school, home

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Assistant" }

    static var caseDisplayRepresentations: [AssistantChoice: DisplayRepresentation] {
        [
            .jarvis: "Jarvis (Michael · Work)",
            .snarf: "Snarf (Michael · Home)",
            .school: "School (Michelle · Work)",
            .home: "Home (Michelle · Home)",
        ]
    }

    var assistant: Assistant {
        switch self {
        case .jarvis: return .jarvis
        case .snarf:  return .snarf
        case .school: return .school
        case .home:   return .home
        }
    }
}

/// The intent that launches the app and activates the chosen assistant. Triggered
/// by a Siri Shortcut named after the wake word ("Hey Siri, Jarvis").
struct ActivateAssistantIntent: AppIntent {
    static var title: LocalizedStringResource { "Activate Assistant" }
    static var description: IntentDescription {
        "Wake a household assistant and start listening for commands."
    }

    /// Bring the app to the foreground so it can listen and speak.
    static var openAppWhenRun: Bool { true }

    @Parameter(title: "Assistant")
    var assistant: AssistantChoice

    init() {}
    init(assistant: AssistantChoice) { self.assistant = assistant }

    @MainActor
    func perform() async throws -> some IntentResult {
        ActivationCoordinator.shared.request(assistant.assistant)
        return .result()
    }
}
