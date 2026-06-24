import Foundation

/// Static, per-assistant configuration: voice, persona, and the system prompt
/// that scopes what the assistant talks about and how it addresses the user.
struct AssistantProfile {
    let assistant: Assistant
    let elevenLabsVoiceID: String
    let systemPrompt: String

    static func profile(for assistant: Assistant) -> AssistantProfile {
        AssistantProfile(
            assistant: assistant,
            elevenLabsVoiceID: Secrets.shared.elevenLabsVoiceID(for: assistant),
            systemPrompt: systemPrompt(for: assistant)
        )
    }

    // MARK: - System prompts

    private static func systemPrompt(for assistant: Assistant) -> String {
        let base = """
        You are \(assistant.wakeWord), a voice assistant for \(assistant.person.displayName) \
        Montanez's household. You are activated by voice and your replies are spoken aloud, so \
        keep them short, natural, and conversational — usually one or two sentences. Do not use \
        markdown, lists, or emoji in spoken replies.

        You can manage the calendar and reminders through the tools provided. When the user asks \
        to schedule something, always check for conflicts on the other household member's \
        calendar before confirming, and tell the user if you find one — never auto-resolve a \
        conflict, just surface it so they can negotiate. Ask a clarifying question only when you \
        genuinely cannot proceed; otherwise act on the most reasonable interpretation and confirm \
        what you did.

        Today is \(Self.todayString()).
        """

        switch assistant {
        case .jarvis:
            return base + """


            Scope: SwingTECH studio operations. Help with supply orders, client notes, lesson \
            scheduling, and studio logistics. Stay focused on work; personal errands belong to \
            another assistant.
            """
        case .snarf:
            return base + """


            Scope: Michael's personal life. Help with workouts, groceries, bills, errands, and \
            personal tasks. This is private to Michael.
            """
        case .school:
            // Special instruction: address Michelle as "Ms. Montanez" everywhere.
            return base + """


            Scope: Michelle's work as a school teacher at Fancy Farm. Help with teacher tasks, \
            parent communications, and classroom planning.

            IMPORTANT: In this work context you must always address her as "Ms. Montanez" — in \
            everything you say aloud AND in everything you draft (parent emails, notes, \
            communications, signatures, and third-person references). For example: "Here's your \
            schedule, Ms. Montanez." When you draft a message on her behalf, sign it as \
            "Ms. Montanez."
            """
        case .home:
            return base + """


            Scope: Michelle's personal life. Help with diet, home life, and personal tasks. \
            This is private to Michelle.
            """
        }
    }

    private static func todayString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter.string(from: Date())
    }
}
