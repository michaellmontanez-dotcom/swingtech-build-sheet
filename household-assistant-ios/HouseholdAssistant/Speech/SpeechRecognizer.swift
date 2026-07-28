import AVFoundation
import Foundation
import Speech

/// On-device speech-to-text using the iOS Speech framework. Listens continuously
/// and segments utterances by a short trailing silence, so the user can rapid-fire
/// commands without repeating the wake word. Each finished utterance is delivered
/// via `onFinalUtterance`.
@MainActor
final class SpeechRecognizer: ObservableObject {
    @Published private(set) var partialTranscript = ""
    @Published private(set) var isListening = false

    /// Called once per completed utterance with the finalized text.
    var onFinalUtterance: ((String) -> Void)?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var currentText = ""

    /// Silence after speech before an utterance is considered complete.
    private let endOfUtteranceSilence: TimeInterval = 1.2

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        let speechOK = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
        let micOK = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        return speechOK && micOK
    }

    // MARK: - Listening

    func start() throws {
        guard !isListening else { return }
        guard let recognizer, recognizer.isAvailable else { return }

        try configureAudioSession()
        beginRecognition(on: recognizer)
        isListening = true
    }

    func stop() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        partialTranscript = ""
        currentText = ""
        isListening = false
    }

    // MARK: - Internals

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio,
                                options: [.duckOthers, .defaultToSpeaker])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func beginRecognition(on recognizer: SFSpeechRecognizer) {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        try? audioEngine.start()

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    let text = result.bestTranscription.formattedString
                    self.currentText = text
                    self.partialTranscript = text
                    self.resetSilenceTimer()
                }
                if error != nil {
                    self.resetSilenceTimer() // flush whatever we have
                }
            }
        }
    }

    private func resetSilenceTimer() {
        silenceTimer?.invalidate()
        guard !currentText.isEmpty else { return }
        silenceTimer = Timer.scheduledTimer(
            withTimeInterval: endOfUtteranceSilence, repeats: false
        ) { [weak self] _ in
            Task { @MainActor in self?.finalizeUtterance() }
        }
    }

    private func finalizeUtterance() {
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        // Deliver, then restart the recognition request for the next utterance
        // while keeping the audio engine + tap running.
        onFinalUtterance?(text)
        currentText = ""
        partialTranscript = ""

        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil

        if isListening, let recognizer, recognizer.isAvailable {
            restartRequest(on: recognizer)
        }
    }

    private func restartRequest(on recognizer: SFSpeechRecognizer) {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    self.currentText = result.bestTranscription.formattedString
                    self.partialTranscript = self.currentText
                    self.resetSilenceTimer()
                }
                if error != nil { self.resetSilenceTimer() }
            }
        }
    }
}
