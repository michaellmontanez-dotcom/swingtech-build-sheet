import SwiftUI

/// The active-assistant screen: shows who's listening, the live transcript, the
/// current partial transcription, and a dismiss button.
struct AssistantView: View {
    @EnvironmentObject private var session: AssistantSession

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            TranscriptView(messages: session.transcript)
            footer
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(session.activeAssistant?.wakeWord ?? "")
                .font(.largeTitle.bold())
            if let assistant = session.activeAssistant {
                Text("\(assistant.person.displayName) · \(assistant.scope.rawValue.capitalized)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            phaseLabel
        }
        .padding()
        .frame(maxWidth: .infinity)
    }

    private var phaseLabel: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(phaseColor)
                .frame(width: 10, height: 10)
            Text(phaseText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 4)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            if !session.partialTranscript.isEmpty {
                Text(session.partialTranscript)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
            }
            if !session.statusMessage.isEmpty {
                Text(session.statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            Button(role: .destructive) {
                session.dismiss()
            } label: {
                Label("Dismiss", systemImage: "stop.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
        }
        .padding(.vertical)
    }

    private var phaseText: String {
        switch session.phase {
        case .idle: return "Idle"
        case .listening: return "Listening…"
        case .thinking: return "Thinking…"
        case .speaking: return "Speaking…"
        case .asleep: return "Asleep — say the wake word to start again"
        }
    }

    private var phaseColor: Color {
        switch session.phase {
        case .listening: return .green
        case .thinking: return .yellow
        case .speaking: return .blue
        case .asleep, .idle: return .gray
        }
    }
}
