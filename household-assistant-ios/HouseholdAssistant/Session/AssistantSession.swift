import Combine
import Foundation

/// Orchestrates one active assistant: speech in → Claude → speech out. Manages the
/// 5-minute listening window (rapid-fire commands with no repeated wake word),
/// the stop command, and auto-sleep on inactivity.
@MainActor
final class AssistantSession: ObservableObject {
    enum Phase: Equatable {
        case idle       // nothing active
        case listening  // waiting for a command
        case thinking   // calling Claude / running tools
        case speaking   // playing the reply
        case asleep     // window expired or dismissed
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var activeAssistant: Assistant?
    @Published private(set) var transcript: [ChatMessage] = []
    @Published private(set) var statusMessage = ""
    /// Live partial transcription, mirrored from the recognizer for the UI.
    @Published private(set) var partialTranscript = ""

    let recognizer = SpeechRecognizer()
    let synthesizer = SpeechSynthesizer()

    private var engine: ConversationEngine?
    private var inactivityTask: Task<Void, Never>?
    private var isProcessing = false
    private var cancellables: Set<AnyCancellable> = []

    init() {
        recognizer.$partialTranscript
            .receive(on: RunLoop.main)
            .assign(to: \.partialTranscript, on: self)
            .store(in: &cancellables)
    }

    private let stopPhrases = [
        "stop", "stop listening", "that's all", "thats all", "that is all",
        "goodbye", "good bye", "dismiss", "go to sleep", "never mind", "nevermind",
    ]

    // MARK: - Activation

    func activate(_ assistant: Assistant) async {
        // Re-saying an already-active assistant's wake word just keeps it awake.
        if activeAssistant == assistant, phase != .asleep, phase != .idle {
            resetInactivityTimer()
            return
        }

        activeAssistant = assistant
        engine = ConversationEngine(assistant: assistant)
        transcript = []
        statusMessage = ""

        let authorized = await recognizer.requestAuthorization()
        // Calendar/Reminders access is requested up front but is best-effort —
        // the assistant can still converse if a user declines one of them.
        Task { try? await CalendarService.shared.requestAccess() }
        Task { try? await RemindersService.shared.requestAccess() }

        guard authorized else {
            statusMessage = "Microphone or speech access is off. Enable it in Settings."
            phase = .asleep
            return
        }

        recognizer.onFinalUtterance = { [weak self] text in
            Task { await self?.handle(utterance: text) }
        }
        startListening()
    }

    func dismiss() {
        sleep()
    }

    // MARK: - Command handling

    private func handle(utterance: String) async {
        guard !isProcessing else { return }
        resetInactivityTimer()

        if isStopCommand(utterance) {
            await speakAndSleep("Goodbye.")
            return
        }

        isProcessing = true
        transcript.append(ChatMessage(role: .user, text: utterance))

        // Stop capturing audio while we think and speak, to avoid hearing ourselves.
        recognizer.stop()
        phase = .thinking

        let reply: String
        do {
            reply = try await engine?.respond(to: utterance) ?? "Sorry, I'm not set up yet."
        } catch {
            reply = "Sorry, something went wrong. \(error.localizedDescription)"
        }

        transcript.append(ChatMessage(role: .assistant, text: reply))

        if let assistant = activeAssistant {
            phase = .speaking
            await synthesizer.speak(reply, as: assistant)
        }

        isProcessing = false

        // Resume listening for the next rapid-fire command if still awake.
        if phase != .asleep {
            startListening()
            resetInactivityTimer()
        }
    }

    private func isStopCommand(_ text: String) -> Bool {
        let normalized = text.lowercased().trimmingCharacters(
            in: .whitespacesAndNewlines.union(.punctuationCharacters))
        return stopPhrases.contains(normalized)
    }

    // MARK: - Listening lifecycle

    private func startListening() {
        do {
            try recognizer.start()
            phase = .listening
        } catch {
            statusMessage = "Couldn't start listening: \(error.localizedDescription)"
            phase = .asleep
        }
    }

    private func speakAndSleep(_ text: String) async {
        recognizer.stop()
        phase = .speaking
        if let assistant = activeAssistant {
            await synthesizer.speak(text, as: assistant)
        }
        sleep()
    }

    private func sleep() {
        inactivityTask?.cancel()
        inactivityTask = nil
        recognizer.stop()
        synthesizer.stop()
        Task { await engine?.reset() } // clear context on sleep
        isProcessing = false
        phase = .asleep
    }

    // MARK: - Inactivity window

    private func resetInactivityTimer() {
        inactivityTask?.cancel()
        inactivityTask = Task { [weak self] in
            let window = AppConfig.listeningWindow
            try? await Task.sleep(nanoseconds: UInt64(window * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.sleep() }
        }
    }
}
