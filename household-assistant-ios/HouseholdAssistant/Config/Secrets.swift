import Foundation

/// Reads secrets injected into Info.plist from Secrets.xcconfig at build time.
/// Nothing here is hard-coded; missing values surface as a clear runtime warning.
struct Secrets {
    static let shared = Secrets()

    let claudeAPIKey: String
    let elevenLabsAPIKey: String

    private let voiceIDs: [Assistant: String]

    private init() {
        let bundle = Bundle.main
        claudeAPIKey = Secrets.value(for: "CLAUDE_API_KEY", in: bundle)
        elevenLabsAPIKey = Secrets.value(for: "ELEVENLABS_API_KEY", in: bundle)
        voiceIDs = [
            .jarvis: Secrets.value(for: "ELEVENLABS_VOICE_JARVIS", in: bundle),
            .snarf:  Secrets.value(for: "ELEVENLABS_VOICE_SNARF", in: bundle),
            .school: Secrets.value(for: "ELEVENLABS_VOICE_SCHOOL", in: bundle),
            .home:   Secrets.value(for: "ELEVENLABS_VOICE_HOME", in: bundle),
        ]
    }

    func elevenLabsVoiceID(for assistant: Assistant) -> String {
        voiceIDs[assistant] ?? ""
    }

    private static func value(for key: String, in bundle: Bundle) -> String {
        let raw = (bundle.object(forInfoDictionaryKey: key) as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            print("⚠️ Secrets: \(key) is not set. Fill it in Secrets.xcconfig and rebuild.")
        }
        return trimmed
    }
}
