import EventKit
import Foundation

enum CalendarError: LocalizedError {
    case accessDenied
    case noWritableCalendar

    var errorDescription: String? {
        switch self {
        case .accessDenied:
            return "Calendar access was denied. Enable it in Settings."
        case .noWritableCalendar:
            return "No writable calendar is available."
        }
    }
}

/// Reads and writes Apple Calendar via EventKit, and maps EKCalendars to the two
/// household members plus the shared household calendar.
///
/// Calendar resolution is by title (configurable below). Michael and Michelle each
/// have a personal calendar; a "Household" calendar is the shared one that
/// auto-syncs to both. If a person's calendar isn't found, we fall back to the
/// default calendar so the app still works out of the box.
final class CalendarService {
    static let shared = CalendarService()

    private let store = EKEventStore()

    /// Sentinel appended to an event's notes to mark it "do not share". Stripped
    /// before display. EKEvent has no custom-field storage, so we tag the notes.
    private static let doNotShareTag = "[ha:private]"

    // Calendar titles. Adjust to match the user's actual calendar names.
    private let michaelCalendarTitle = "Michael"
    private let michelleCalendarTitle = "Michelle"
    private let householdCalendarTitle = "Household"

    // MARK: - Access

    @discardableResult
    func requestAccess() async throws -> Bool {
        let granted = try await store.requestFullAccessToEvents()
        guard granted else { throw CalendarError.accessDenied }
        return true
    }

    // MARK: - Calendar resolution

    private func calendar(titled title: String) -> EKCalendar? {
        store.calendars(for: .event).first {
            $0.title.caseInsensitiveCompare(title) == .orderedSame
        }
    }

    private func personalCalendar(for person: Person) -> EKCalendar? {
        switch person {
        case .michael:  return calendar(titled: michaelCalendarTitle)
        case .michelle: return calendar(titled: michelleCalendarTitle)
        }
    }

    private var sharedCalendar: EKCalendar? { calendar(titled: householdCalendarTitle) }

    private func owner(of calendar: EKCalendar) -> Person? {
        if calendar.title.caseInsensitiveCompare(michaelCalendarTitle) == .orderedSame { return .michael }
        if calendar.title.caseInsensitiveCompare(michelleCalendarTitle) == .orderedSame { return .michelle }
        return nil
    }

    // MARK: - Reads

    /// Events for a person within a range: their personal calendar + the shared one.
    /// `includePrivate` controls whether "do not share" events are returned — set
    /// false when viewing as the *other* person (those events are hidden from them).
    func events(
        for person: Person,
        from start: Date,
        to end: Date,
        includePrivate: Bool
    ) -> [HouseholdEvent] {
        var calendars: [EKCalendar] = []
        if let personal = personalCalendar(for: person) { calendars.append(personal) }
        if let shared = sharedCalendar { calendars.append(shared) }
        if calendars.isEmpty, let def = store.defaultCalendarForNewEvents {
            calendars = [def]
        }

        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        return store.events(matching: predicate)
            .map(householdEvent(from:))
            .filter { includePrivate || !$0.doNotShare }
    }

    // MARK: - Writes

    @discardableResult
    func createEvent(
        title: String,
        start: Date,
        end: Date,
        for person: Person,
        location: String?,
        notes: String?,
        isShared: Bool,
        doNotShare: Bool
    ) throws -> HouseholdEvent {
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = start
        event.endDate = end
        event.location = location

        var finalNotes = notes ?? ""
        if doNotShare {
            finalNotes += (finalNotes.isEmpty ? "" : "\n") + Self.doNotShareTag
        }
        event.notes = finalNotes.isEmpty ? nil : finalNotes

        let target: EKCalendar?
        if isShared {
            target = sharedCalendar ?? personalCalendar(for: person) ?? store.defaultCalendarForNewEvents
        } else {
            target = personalCalendar(for: person) ?? store.defaultCalendarForNewEvents
        }
        guard let calendar = target else { throw CalendarError.noWritableCalendar }
        event.calendar = calendar

        try store.save(event, span: .thisEvent)
        return householdEvent(from: event)
    }

    // MARK: - Mapping

    private func householdEvent(from event: EKEvent) -> HouseholdEvent {
        let rawNotes = event.notes ?? ""
        let doNotShare = rawNotes.contains(Self.doNotShareTag)
        let cleanNotes = rawNotes
            .replacingOccurrences(of: Self.doNotShareTag, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let isShared = event.calendar?.title.caseInsensitiveCompare(householdCalendarTitle) == .orderedSame

        return HouseholdEvent(
            id: event.eventIdentifier ?? UUID().uuidString,
            title: event.title ?? "(untitled)",
            start: event.startDate,
            end: event.endDate,
            location: event.location,
            notes: cleanNotes.isEmpty ? nil : cleanNotes,
            owner: event.calendar.flatMap(owner(of:)),
            isShared: isShared,
            doNotShare: doNotShare
        )
    }
}
