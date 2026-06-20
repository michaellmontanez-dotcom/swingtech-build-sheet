import Foundation

/// Bridge between the App Intent (the Siri wake word) and the running UI. The
/// intent launches the app and records which assistant to activate; RootView
/// observes this and starts the session.
@MainActor
final class ActivationCoordinator: ObservableObject {
    static let shared = ActivationCoordinator()

    @Published var requestedAssistant: Assistant?

    private init() {}

    func request(_ assistant: Assistant) {
        requestedAssistant = assistant
    }

    /// Consume the pending request (so it isn't re-triggered on every view update).
    func take() -> Assistant? {
        defer { requestedAssistant = nil }
        return requestedAssistant
    }
}
