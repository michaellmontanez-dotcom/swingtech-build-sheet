import EventKit
import Foundation

enum RemindersError: LocalizedError {
    case accessDenied
    case noWritableList

    var errorDescription: String? {
        switch self {
        case .accessDenied:  return "Reminders access was denied. Enable it in Settings."
        case .noWritableList: return "No writable Reminders list is available."
        }
    }
}

/// A reminder in household terms.
struct HouseholdReminder: Identifiable {
    let id: String
    var title: String
    var due: Date?
    var isCompleted: Bool
    var listName: String?
}

/// Reads and writes Apple Reminders via EventKit. Reminders is the primary target
/// for list capture; Notes is reserved for freeform share-sheet capture.
final class RemindersService {
    static let shared = RemindersService()

    private let store = EKEventStore()

    @discardableResult
    func requestAccess() async throws -> Bool {
        let granted = try await store.requestFullAccessToReminders()
        guard granted else { throw RemindersError.accessDenied }
        return true
    }

    /// Resolve a list by name, or fall back to the default Reminders list.
    private func list(named name: String?) -> EKCalendar? {
        if let name, !name.isEmpty {
            if let match = store.calendars(for: .reminder).first(where: {
                $0.title.caseInsensitiveCompare(name) == .orderedSame
            }) {
                return match
            }
        }
        return store.defaultCalendarForNewReminders()
    }

    @discardableResult
    func addReminder(title: String, due: Date?, listName: String?) throws -> HouseholdReminder {
        guard let calendar = list(named: listName) else { throw RemindersError.noWritableList }
        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.calendar = calendar
        if let due {
            reminder.dueDateComponents = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute], from: due)
        }
        try store.save(reminder, commit: true)
        return HouseholdReminder(
            id: reminder.calendarItemIdentifier,
            title: reminder.title,
            due: due,
            isCompleted: reminder.isCompleted,
            listName: calendar.title)
    }

    /// Fetch incomplete reminders, optionally scoped to one list.
    func incompleteReminders(listName: String?) async -> [HouseholdReminder] {
        let calendars = list(named: listName).map { [$0] }
        let predicate = store.predicateForIncompleteReminders(
            withDueDateStarting: nil, ending: nil, calendars: calendars)
        return await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { reminders in
                let mapped = (reminders ?? []).map {
                    HouseholdReminder(
                        id: $0.calendarItemIdentifier,
                        title: $0.title ?? "(untitled)",
                        due: $0.dueDateComponents?.date,
                        isCompleted: $0.isCompleted,
                        listName: $0.calendar?.title)
                }
                continuation.resume(returning: mapped)
            }
        }
    }
}
