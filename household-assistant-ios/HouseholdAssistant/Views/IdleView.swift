import SwiftUI

/// Shown when no assistant is active. Lists the wake words and lets the user tap to
/// activate (useful for testing without Siri).
struct IdleView: View {
    @EnvironmentObject private var session: AssistantSession

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            Image(systemName: "house.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("Household Assistant")
                .font(.title.bold())
            Text("Say “Hey Siri, ” then a wake word — or tap one to start.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            VStack(spacing: 12) {
                ForEach(Assistant.allCases) { assistant in
                    Button {
                        Task { await session.activate(assistant) }
                    } label: {
                        HStack {
                            Image(systemName: "mic.fill")
                            VStack(alignment: .leading) {
                                Text(assistant.wakeWord).font(.headline)
                                Text("\(assistant.person.displayName) · \(assistant.scope.rawValue.capitalized)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding()
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)

            Spacer()
        }
    }
}
