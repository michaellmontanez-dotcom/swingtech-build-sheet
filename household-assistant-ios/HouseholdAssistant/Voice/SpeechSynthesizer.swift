import AVFoundation
import Foundation

/// Speaks the assistant's replies. Prefers the assistant's distinct ElevenLabs
/// voice; if ElevenLabs is unavailable (no key, network error), falls back to the
/// on-device AVSpeechSynthesizer so the app still talks.
@MainActor
final class SpeechSynthesizer: NSObject, ObservableObject {
    @Published private(set) var isSpeaking = false

    private let elevenLabs = ElevenLabsClient()
    private var audioPlayer: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var playbackContinuation: CheckedContinuation<Void, Never>?

    /// Speak `text` in the assistant's voice and return when playback finishes.
    func speak(_ text: String, as assistant: Assistant) async {
        guard !text.isEmpty else { return }
        isSpeaking = true
        defer { isSpeaking = false }

        let voiceID = Secrets.shared.elevenLabsVoiceID(for: assistant)
        do {
            let audio = try await elevenLabs.synthesize(text: text, voiceID: voiceID)
            try await play(audio)
        } catch {
            print("⚠️ ElevenLabs unavailable (\(error.localizedDescription)); using on-device voice.")
            await speakWithFallback(text)
        }
    }

    func stop() {
        audioPlayer?.stop()
        audioPlayer = nil
        if fallback.isSpeaking { fallback.stopSpeaking(at: .immediate) }
        resumePlayback()
        isSpeaking = false
    }

    // MARK: - ElevenLabs playback

    private func play(_ data: Data) async throws {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try AVAudioSession.sharedInstance().setActive(true)
        let player = try AVAudioPlayer(data: data)
        player.delegate = self
        audioPlayer = player
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            playbackContinuation = continuation
            player.play()
        }
    }

    private func resumePlayback() {
        playbackContinuation?.resume()
        playbackContinuation = nil
    }

    // MARK: - On-device fallback

    private func speakWithFallback(_ text: String) async {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            playbackContinuation = continuation
            fallback.delegate = self
            fallback.speak(utterance)
        }
    }
}

extension SpeechSynthesizer: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.resumePlayback() }
    }
}

extension SpeechSynthesizer: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                                       didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.resumePlayback() }
    }
}
