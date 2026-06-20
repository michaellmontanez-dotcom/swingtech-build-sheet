import AppIntents

/// Registers the four assistants as App Shortcuts so they appear in the Shortcuts
/// app and Spotlight automatically. App Shortcut phrases must include the app name,
/// so these read "Hey Siri, Household Assistant Jarvis".
///
/// To get the exact "Hey Siri, Jarvis" experience, create a personal shortcut in
/// the Shortcuts app named "Jarvis" that runs the Activate Assistant action — see
/// the README. These provider phrases are the zero-setup fallback.
struct HouseholdAssistantShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ActivateAssistantIntent(assistant: .jarvis),
            phrases: [
                "\(.applicationName) Jarvis",
                "Activate Jarvis in \(.applicationName)",
            ],
            shortTitle: "Jarvis",
            systemImageName: "mic.circle")
        AppShortcut(
            intent: ActivateAssistantIntent(assistant: .snarf),
            phrases: [
                "\(.applicationName) Snarf",
                "Activate Snarf in \(.applicationName)",
            ],
            shortTitle: "Snarf",
            systemImageName: "mic.circle")
        AppShortcut(
            intent: ActivateAssistantIntent(assistant: .school),
            phrases: [
                "\(.applicationName) School",
                "Activate School in \(.applicationName)",
            ],
            shortTitle: "School",
            systemImageName: "mic.circle")
        AppShortcut(
            intent: ActivateAssistantIntent(assistant: .home),
            phrases: [
                "\(.applicationName) Home",
                "Activate Home in \(.applicationName)",
            ],
            shortTitle: "Home",
            systemImageName: "mic.circle")
    }
}
