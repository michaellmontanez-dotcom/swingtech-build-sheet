import Foundation

/// Tunable, non-secret app configuration.
enum AppConfig {

    // MARK: - Claude

    /// Default to the most capable model. Voice replies are short, so cost is modest.
    static let claudeModel = "claude-opus-4-8"
    static let claudeAPIVersion = "2023-06-01"
    static let claudeMaxTokens = 1024

    /// Extended thinking adds latency to the voice loop, so it is off by default.
    /// Set to `true` to trade response speed for deeper reasoning on hard requests
    /// (uses adaptive thinking — the only supported mode on Opus 4.8).
    static let claudeUseAdaptiveThinking = false

    // MARK: - Session

    /// The assistant keeps listening this long after the last activity before
    /// auto-sleeping. The user can rapid-fire commands within this window without
    /// repeating the wake word.
    static let listeningWindow: TimeInterval = 5 * 60

    // MARK: - Voice

    /// ElevenLabs model for text-to-speech. Flash v2.5 is the lowest-latency option,
    /// which matters most in a real-time voice loop.
    static let elevenLabsModelID = "eleven_flash_v2_5"
}
