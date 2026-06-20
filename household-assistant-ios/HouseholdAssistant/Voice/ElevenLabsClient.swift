import Foundation

enum ElevenLabsError: LocalizedError {
    case missingConfig
    case http(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .missingConfig:
            return "ElevenLabs API key or voice ID is missing. Check Secrets.xcconfig."
        case let .http(status, message):
            return "ElevenLabs error \(status): \(message)"
        }
    }
}

/// Calls the ElevenLabs text-to-speech REST API and returns audio data (MP3).
struct ElevenLabsClient {
    private let session = URLSession.shared

    func synthesize(text: String, voiceID: String) async throws -> Data {
        let apiKey = Secrets.shared.elevenLabsAPIKey
        guard !apiKey.isEmpty, !voiceID.isEmpty else { throw ElevenLabsError.missingConfig }

        let url = URL(string: "https://api.elevenlabs.io/v1/text-to-speech/\(voiceID)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("audio/mpeg", forHTTPHeaderField: "accept")

        let body: [String: Any] = [
            "text": text,
            "model_id": AppConfig.elevenLabsModelID,
            "voice_settings": ["stability": 0.5, "similarity_boost": 0.75],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ElevenLabsError.http(status: -1, message: "No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw ElevenLabsError.http(status: http.statusCode, message: message)
        }
        return data
    }
}
