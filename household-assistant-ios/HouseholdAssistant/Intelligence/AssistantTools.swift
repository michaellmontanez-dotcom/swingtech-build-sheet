import Foundation

/// Defines the tools available to the assistants and dispatches tool calls to the
/// calendar and reminders services. Scoped to one assistant so writes and conflict
/// checks happen as the correct person.
struct AssistantTools {
    let assistant: Assistant
    private let calendarService = CalendarService.shared
    private let remindersService = RemindersService.shared
    private let conflictDetector = ConflictDetector()

    // MARK: - Definitions

    var definitions: [ClaudeTool] {
        [
            ClaudeTool(
                name: "create_calendar_event",
                description: """
                Create a calendar event for \(assistant.person.displayName). Always check for \
                conflicts first with check_calendar_conflicts; if there is a conflict, surface it \
                to the user before creating. Times are ISO-8601 (e.g. 2026-06-21T14:00:00).
                """,
                input_schema: [
                    "type": "object",
                    "properties": [
                        "title": ["type": "string"],
                        "start": ["type": "string", "description": "ISO-8601 start datetime"],
                        "end": ["type": "string", "description": "ISO-8601 end datetime"],
                        "location": ["type": "string"],
                        "shared": [
                            "type": "boolean",
                            "description": "True if this is a household event both people should see.",
                        ],
                        "do_not_share": [
                            "type": "boolean",
                            "description": "True to completely hide this event from the other person.",
                        ],
                    ],
                    "required": ["title", "start", "end"],
                ]),
            ClaudeTool(
                name: "check_calendar_conflicts",
                description: """
                Check the OTHER household member's calendar for conflicts in a time range before \
                scheduling. Returns any overlapping events. Times are ISO-8601.
                """,
                input_schema: [
                    "type": "object",
                    "properties": [
                        "start": ["type": "string"],
                        "end": ["type": "string"],
                    ],
                    "required": ["start", "end"],
                ]),
            ClaudeTool(
                name: "list_calendar_events",
                description: "List \(assistant.person.displayName)'s events in a time range. Times are ISO-8601.",
                input_schema: [
                    "type": "object",
                    "properties": [
                        "start": ["type": "string"],
                        "end": ["type": "string"],
                    ],
                    "required": ["start", "end"],
                ]),
            ClaudeTool(
                name: "add_reminder",
                description: "Add a reminder/task to Apple Reminders. Optional ISO-8601 due date and list name.",
                input_schema: [
                    "type": "object",
                    "properties": [
                        "title": ["type": "string"],
                        "due": ["type": "string", "description": "ISO-8601 due datetime"],
                        "list": ["type": "string", "description": "Reminders list name"],
                    ],
                    "required": ["title"],
                ]),
            ClaudeTool(
                name: "list_reminders",
                description: "List incomplete reminders, optionally from a specific list.",
                input_schema: [
                    "type": "object",
                    "properties": [
                        "list": ["type": "string"],
                    ],
                ]),
        ]
    }

    // MARK: - Dispatch

    /// Executes a tool call and returns a result string and error flag for tool_result.
    func execute(name: String, input: JSONValue) async -> (content: String, isError: Bool) {
        do {
            switch name {
            case "create_calendar_event": return (try createEvent(input), false)
            case "check_calendar_conflicts": return (try checkConflicts(input), false)
            case "list_calendar_events": return (try listEvents(input), false)
            case "add_reminder": return (try addReminder(input), false)
            case "list_reminders": return (await listReminders(input), false)
            default: return ("Unknown tool: \(name)", true)
            }
        } catch {
            return (error.localizedDescription, true)
        }
    }

    // MARK: - Handlers

    private func createEvent(_ input: JSONValue) throws -> String {
        guard let title = input["title"]?.stringValue,
              let start = parseDate(input["start"]),
              let end = parseDate(input["end"]) else {
            return "Missing or invalid title/start/end."
        }
        let shared = input["shared"]?.boolValue ?? false
        let doNotShare = input["do_not_share"]?.boolValue ?? false

        let conflicts = conflictDetector.conflicts(
            forBookingBy: assistant.person, start: start, end: end)

        let event = try calendarService.createEvent(
            title: title, start: start, end: end, for: assistant.person,
            location: input["location"]?.stringValue, notes: nil,
            isShared: shared, doNotShare: doNotShare)

        var result = "Created \"\(event.title)\" on \(format(event.start))."
        if !conflicts.isEmpty {
            let names = conflicts.map(\.conflictingTitle).joined(separator: ", ")
            result += " NOTE: this conflicts with \(conflicts[0].otherPerson.displayName)'s "
                + "calendar (\(names)). Tell the user — do not resolve it yourself."
        }
        return result
    }

    private func checkConflicts(_ input: JSONValue) throws -> String {
        guard let start = parseDate(input["start"]), let end = parseDate(input["end"]) else {
            return "Missing or invalid start/end."
        }
        let conflicts = conflictDetector.conflicts(
            forBookingBy: assistant.person, start: start, end: end)
        if conflicts.isEmpty { return "No conflicts found." }
        let lines = conflicts.map {
            "\($0.otherPerson.displayName): \"\($0.conflictingTitle)\" \(format($0.start))–\(format($0.end))"
        }
        return "Conflicts found:\n" + lines.joined(separator: "\n")
    }

    private func listEvents(_ input: JSONValue) throws -> String {
        guard let start = parseDate(input["start"]), let end = parseDate(input["end"]) else {
            return "Missing or invalid start/end."
        }
        let events = calendarService.events(
            for: assistant.person, from: start, to: end, includePrivate: true)
        if events.isEmpty { return "No events in that range." }
        return events
            .sorted { $0.start < $1.start }
            .map { "\"\($0.title)\" \(format($0.start))–\(format($0.end))" }
            .joined(separator: "\n")
    }

    private func addReminder(_ input: JSONValue) throws -> String {
        guard let title = input["title"]?.stringValue else { return "Missing reminder title." }
        let reminder = try remindersService.addReminder(
            title: title, due: parseDate(input["due"]), listName: input["list"]?.stringValue)
        return "Added reminder \"\(reminder.title)\""
            + (reminder.due.map { " due \(format($0))" } ?? "") + "."
    }

    private func listReminders(_ input: JSONValue) async -> String {
        let reminders = await remindersService.incompleteReminders(
            listName: input["list"]?.stringValue)
        if reminders.isEmpty { return "No incomplete reminders." }
        return reminders.map { "• \($0.title)" }.joined(separator: "\n")
    }

    // MARK: - Date helpers

    private func parseDate(_ value: JSONValue?) -> Date? {
        guard let raw = value?.stringValue, !raw.isEmpty else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: raw) { return d }

        let internet = ISO8601DateFormatter()
        internet.formatOptions = [.withInternetDateTime]
        if let d = internet.date(from: raw) { return d }

        // Fallback: "yyyy-MM-dd'T'HH:mm:ss" without timezone, interpreted as local.
        let local = DateFormatter()
        local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        local.timeZone = .current
        if let d = local.date(from: raw) { return d }

        local.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return local.date(from: raw)
    }

    private func format(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE MMM d, h:mm a"
        return f.string(from: date)
    }
}
