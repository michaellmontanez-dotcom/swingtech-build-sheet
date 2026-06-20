import SwiftUI

/// Hosts the active assistant UI and bridges wake-word activations into the session.
struct RootView: View {
    @EnvironmentObject private var session: AssistantSession
    @EnvironmentObject private var coordinator: ActivationCoordinator

    var body: some View {
        Group {
            if session.activeAssistant != nil {
                AssistantView()
            } else {
                IdleView()
            }
        }
        // Activation can arrive before or after the view appears, so handle both.
        .onAppear { consumePendingActivation() }
        .onChange(of: coordinator.requestedAssistant) { _, _ in consumePendingActivation() }
    }

    private func consumePendingActivation() {
        guard let assistant = coordinator.take() else { return }
        Task { await session.activate(assistant) }
    }
}
