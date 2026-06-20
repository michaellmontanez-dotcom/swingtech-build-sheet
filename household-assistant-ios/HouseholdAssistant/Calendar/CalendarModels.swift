import Foundation

/// A calendar event in household terms, decoupled from EventKit.
struct HouseholdEvent: Identifiable {
    let id: String
    var title: String
    var start: Date
    var end: Date
    var location: String?
    var notes: String?
    /// Owning person (resolved from the calendar the event lives on).
    var owner: Person?
    /// Shared events live on the household calendar and are visible to both people.
    var isShared: Bool
    /// "Do not share" events are completely hidden from the other person's view.
    var doNotShare: Bool
}

/// A detected scheduling conflict on the *other* household member's calendar.
struct CalendarConflict: Identifiable {
    let id = UUID()
    let otherPerson: Person
    let conflictingTitle: String
    let start: Date
    let end: Date
}
