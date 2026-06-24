import SwiftUI

@main
struct HouseholdAssistantApp: App {
    @StateObject private var session = AssistantSession()
    @StateObject private var coordinator = ActivationCoordinator.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(coordinator)
        }
    }
}
