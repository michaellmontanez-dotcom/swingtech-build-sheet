import Foundation

/// Detects scheduling conflicts on the *other* household member's calendar.
/// The assistants flag conflicts but never auto-resolve them — humans negotiate.
struct ConflictDetector {
    let calendarService: CalendarService

    init(calendarService: CalendarService = .shared) {
        self.calendarService = calendarService
    }

    /// Returns conflicts the given person would create by booking [start, end].
    /// Checks the OTHER person's calendar (personal + shared), excluding their
    /// "do not share" events, which are hidden from this person's view.
    func conflicts(
        forBookingBy person: Person,
        start: Date,
        end: Date
    ) -> [CalendarConflict] {
        let other: Person = (person == .michael) ? .michelle : .michael
        let theirEvents = calendarService.events(
            for: other, from: start, to: end, includePrivate: false)

        return theirEvents
            .filter { overlaps(aStart: start, aEnd: end, bStart: $0.start, bEnd: $0.end) }
            .map { CalendarConflict(
                otherPerson: other,
                conflictingTitle: $0.title,
                start: $0.start,
                end: $0.end) }
    }

    private func overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) -> Bool {
        aStart < bEnd && bStart < aEnd
    }
}
