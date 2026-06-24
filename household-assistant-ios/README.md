# Household Assistant (iOS)

A voice-first iOS app for the Montanez household. Each person runs two
compartmentalized assistants — a Work assistant and a Home assistant — each with
its own wake word, ElevenLabs voice, and scoped context. The assistants are
isolated from each other but all read the shared household calendar for conflict
detection.

| Person | Assistant | Wake word | Scope |
|--------|-----------|-----------|-------|
| Michael | Work | **Jarvis** | SwingTECH studio: supply orders, client notes, lesson scheduling |
| Michael | Home | **Snarf** | Personal: workouts, groceries, bills, errands |
| Michelle | Work | **School** | School/Fancy Farm — always addresses her as *Ms. Montanez* |
| Michelle | Home | **Home** | Personal: diet, home life |

> Michelle's wake words ("School", "Home") are provisional pending Michael's
> confirmation. Change them in `Models/Assistant.swift` (`wakeWord`) and the
> phrases in `Intents/HouseholdAssistantShortcuts.swift`.

## Status

This is the MVP scaffold covering the full core loop end-to-end:

1. ✅ "Hey Siri, [wake word]" launches the correct assistant (App Intents + Shortcuts)
2. ✅ 5-minute listening window with rapid-fire commands (no repeated wake word)
3. ✅ Natural-language commands routed to the Claude API (`claude-opus-4-8`)
4. ✅ Spoken replies via ElevenLabs (distinct voice per assistant; on-device fallback)
5. ✅ Apple Calendar read/write via EventKit + cross-user conflict detection
6. ✅ Apple Reminders read/write for list capture
7. ✅ Isolated context per assistant (Work vs Home never mix)
8. ✅ Shared-calendar conflict logic (flag, never auto-resolve; "do not share" hidden)

It has **not** been compiled in Xcode yet (authored in a Linux environment).
First build will likely need minor adjustments — see *Known limitations*.

## Getting started

Requires macOS with Xcode 15+ and an iPhone running iOS 17+ (the Speech +
ElevenLabs + EventKit flow needs a real device; the simulator has no microphone
for live capture).

```bash
brew install xcodegen

cd household-assistant-ios
cp HouseholdAssistant/Resources/Secrets.example.xcconfig \
   HouseholdAssistant/Resources/Secrets.xcconfig
# Edit Secrets.xcconfig — fill in keys + voice IDs (see below)

xcodegen generate
open HouseholdAssistant.xcodeproj
```

Select your team under *Signing & Capabilities*, then build to your iPhone.

### Secrets (`Secrets.xcconfig`, gitignored)

| Key | Where to get it |
|-----|-----------------|
| `DEVELOPMENT_TEAM` | Xcode → Settings → Accounts (Apple Developer Team ID) |
| `CLAUDE_API_KEY` | https://console.anthropic.com |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Key |
| `ELEVENLABS_VOICE_JARVIS` / `_SNARF` / `_SCHOOL` / `_HOME` | ElevenLabs → Voices (one distinct voice ID per assistant) |

Keys are injected into `Info.plist` at build time and read by `Config/Secrets.swift`.
Nothing is hard-coded; missing values log a warning at launch.

### Calendars

`Calendar/CalendarService.swift` resolves calendars **by title**. Create three
calendars in Apple Calendar (or rename the constants to match yours):

- `Michael` — Michael's personal calendar
- `Michelle` — Michelle's personal calendar
- `Household` — the shared calendar both people see

Conflict detection checks the *other* person's personal + shared calendars.
Events the assistant marks "do not share" are tagged in the notes and excluded
from the other person's view.

### Wake words

App Shortcuts register automatically as "Hey Siri, **Household Assistant Jarvis**"
(Apple requires the app name in auto-generated phrases). For the exact
"Hey Siri, **Jarvis**" experience, create a personal shortcut once per assistant:

1. Open the **Shortcuts** app → **+**
2. Add action **Activate Assistant**, set the assistant (e.g. Jarvis)
3. Name the shortcut exactly `Jarvis`
4. Repeat for Snarf, School, Home

Now "Hey Siri, Jarvis" launches the app and starts that assistant listening.

## Architecture

```
App/            App entry, RootView wiring
Models/         Assistant/Person/Scope, per-assistant profiles + system prompts
Config/         AppConfig (model, timeouts), Secrets loader
Intents/        App Intents (wake words) + AppShortcutsProvider
Session/        AssistantSession (5-min window, rapid-fire, stop), activation bridge
Speech/         SpeechRecognizer (on-device STT, silence-segmented)
Intelligence/   ClaudeClient (REST), ConversationEngine (tool-use loop), AssistantTools
Calendar/       CalendarService (EventKit), ConflictDetector
Reminders/      RemindersService (EventKit)
Voice/          ElevenLabsClient (TTS), SpeechSynthesizer (playback + fallback)
Views/          SwiftUI screens
```

**Flow:** Siri shortcut → `ActivateAssistantIntent` → `ActivationCoordinator` →
`AssistantSession.activate` → `SpeechRecognizer` transcribes → `ConversationEngine`
calls Claude (running calendar/reminders tools as needed) → `SpeechSynthesizer`
speaks the reply → resume listening until the 5-minute window expires or the user
says "stop".

**Context isolation:** each assistant gets its own `ConversationEngine` with its
own message history; Work and Home never share context. The "Ms. Montanez" rule
lives in the `school` assistant's system prompt (`Models/AssistantProfile.swift`).

**Why raw HTTP for Claude:** Swift has no official Anthropic SDK, so
`ClaudeClient` calls `/v1/messages` directly. Model is `claude-opus-4-8`; extended
thinking is off by default for voice latency (toggle `claudeUseAdaptiveThinking`
in `Config/AppConfig.swift`).

## Known limitations / first-build notes

- **Not yet compiled.** Expect to resolve a few Xcode/SDK details on first build.
- **Wake-word listening is foreground-only.** iOS doesn't allow third-party
  background wake words; the Siri Shortcut is the launch mechanism, by design.
- **Single-device calendars.** EventKit reads the calendars configured on the
  device. True per-person sync across two phones would use shared iCloud/CalDAV
  calendars (the `Household` calendar covers the shared case today).
- **n8n automations** (VPS `198.211.114.184`) are out of the real-time loop for
  MVP, as specified — a future tool can hand long-running workflows off to it.

## Roadmap

- Streaming Claude responses + streaming TTS for lower latency
- Notes share-sheet capture (freeform), per spec
- Calendar event editing/deletion tools and "shared event auto-sync + notify"
- n8n tool for async multi-step automations
