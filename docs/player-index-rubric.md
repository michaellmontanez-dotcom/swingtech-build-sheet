# SwingTECH Player Index — Assessment & Scoring Rubric
**Working name:** SwingTECH Player Index (SPI) — rename to taste (e.g., Game DNA, SwingTECH Progress Index)
**Version:** v1.1 — 2026-06-16
(v1.1 adds §9 Player Experience / Next-Action Engine + supporting schema; old Build Notes → §10, Open Items → §11.)
**Purpose:** Establish a player baseline and a single 0–100 index, re-tested on a cadence, for adults & seniors. Goal-oriented (break 100/90/80, trip/event prep, senior maintenance) — not junior/college.

All scoring windows are v1 calibration defaults — tune them in the bay.

## 1. Design principles
- Four domains: Golf Skills, Physical, Mental/Course Management, Scoring.
- Lead vs. lag: Golf Skills + Physical + Mental are lead factors; Scoring is the lag factor.
- Perceived vs. actual: capture a player self-estimate at intake; display the delta vs measured.
- Re-test cadence: baseline at intake, re-assess every 8–12 weeks.
- Hardware: GCQuad ball + club data; NO putting add-on (putting is manual). Confirm club-data add-on is unlocked before relying on club path / impact location.

## 2. Domain A — Golf Skills (measured)
Four sub-tests, each normalized to 0–100.
A1 Putting (manual, 10 ft max surface): 3 ft x10 makes; 6 ft x10 makes; 10 ft x10 makes + half-credit for misses inside an 18in tap-in circle; speed-control ladder 5/8/10 ft x3 each, leaves inside 3 ft circle; optional field lag 30–40 ft on a real green, % inside 3 ft (replaces ladder when present). Putting sub-score: short makes 40%, 10 ft 25%, distance control 35%.
A2 Wedges (carry + dispersion, land inside carry AND offline window): 30 yd x5 (±4 yd / ±15 ft); 50 yd x5 (±5 yd / ±20 ft); 70 yd x5 (±6 yd / ±25 ft). Sub-score = inside window ÷ attempted x100. Seniors may drop 70 yd.
A3 Approach/Ball Control: stock club (default 7-iron), 10 balls, inside a dispersion ellipse scaled by tier. Break-80 add-on: hold a stock launch/apex window on 5 of 10.
A4 Full Swing/Driving: 10 balls. Contact quality = smash ≥ tier threshold AND impact location in center zone (requires club add-on); fallback w/o club data = ball-speed consistency + dispersion. Dispersion = balls inside offline fairway-proxy band ÷10. Capture max clubhead speed for senior maintenance.
Domain A sub-score = average of A1–A4.

## 3. Domain B — Physical (TPI Movement Screen)
Use standard TPI screen; each item Pass/Limited/Fail = 2/1/0, normalized to 0–100. Senior adds: timed single-leg balance, seated trunk rotation, grip/forearm capacity, speed-retention flag.

## 4. Domain C — Mental / Course Management (self-assessment)
Likert 1–5 → 0–100: pre-shot routine consistency; tee-shot decision discipline; recovery discipline; short-game nerves; reset after a bad hole; practice discipline. Optional coach-observed items. Self-report side feeds the perceived-vs-actual gap (§7).

## 5. Domain D — Scoring / On-Course (lag factors)
Normalize to 0–100 vs tier targets: handicap index; last-5-rounds average; GIR %; up-and-down %; double-bogey-or-worse per round; penalty strokes per round; (senior) clubhead-speed retention vs baseline.

## 6. Tier calibration & composite index
Domain weights — Break100 / Break90 / Break80 / SeniorMaint:
Golf Skills 35/35/40/30; Physical 25/20/15/35; Mental 25/25/20/15; Scoring 15/20/25/20.
SPI (0–100) = sum of (domain sub-score x tier weight).
Window multipliers on A-tests: Break100 x1.30 (smash ≥1.30); Break90 x1.15 (≥1.40); Break80 x1.00 (≥1.45); SeniorMaint x1.20 + speed-retention emphasis (track vs own baseline).

## 7. Perceived vs. actual gap
At intake, player self-rates each domain 0–100. Store and display delta = measured − perceived per domain.

## 8. Goal architecture (maps to existing 3 goal types)
Numeric: break 100/90/80, target SPI, target clubhead speed. Milestone: dated trip/event prep with a readiness checklist. Qualitative: confidence/first-tee/blow-up goals.
New onboarding templates: Break 100 Adult, Break 90 Adult, Break 80 Adult, Senior Maintenance, Trip/Event Prep.

## 9. Player Experience — Home Screen & Next-Action Engine
Goal: every login shows ONE obvious next step + a menu of options. Never a blank screen.
9.1 Next Up — priority-ordered rules engine, first match wins:
P1 no baseline → "Start your baseline assessment"
P2 coach-guided + session booked → "Next session {date}. Homework: {assigned}"
P3 event goal within 30 days → "{Event} in {n} days — {x}/{y} readiness targets met. Work on {weakest}."
P4 re-test window reached (≥8 wks) → "Time to re-measure — book your re-assessment"
P5 baseline fresh, no recent activity → "Your Player Index is {SPI}. Biggest opportunity: {weakest domain}. Try this drill."
P6 default → "You're on track. Pick something below or log a round."
Focus preference (player tie-break) when ≥2 of P2–P4 are live: focus_preference = auto (table order) | coach | event | skills. Chosen item is Next Up; runner-up shows as a secondary "Also" card. P1 and P6 ignore preference. Player sets it from "My goal"; coach sets a starting default.
9.2 Options menu: take/re-take a skill test; log a round (feeds §5); recommended drill for weakest domain; view progress (SPI trend + gauges); my goal; book a session (Setmore); mobility/TPI homework.
9.3 Flavors: self-guided leans on drills + re-test nudges; coach-guided leans on booked sessions + assigned homework.
9.4 Supporting schema: drill_library (drill_id, domain, tier, title, description, media_url); player_state (player_id, last_login, baseline_done, next_action_code, next_action_cached_at, focus_preference [auto|coach|event|skills]).

## 10. Build notes for Claude Code
This is a measurement + index LAYER on the existing student-progress app, not a new app.
Reuse: magic-link player access, per-player metric library, the 3 goal types, onboarding templates.
New Neon Postgres tables (provisioned via Vercel Marketplace; lives in the swingtech-coaching-api repo): assessment (player_id, date, tier, type=baseline|retest); skill_test_result (assessment_id, test_code, raw, normalized); putting_result; tpi_screen; mental_survey; scoring_record; index_snapshot (assessment_id, domain sub-scores, composite SPI, perceived deltas); plus drill_library and player_state (§9.4).
Computed: SPI recalculated on assessment save → index_snapshot; recompute player_state.next_action_code on the same triggers.
Display: player home (Next Up + options); gauge per sub-test + SPI trend over time.
Intake form already captures TPI screen + self-assessment — wire into tpi_screen and the perceived-vs-actual inputs.

## 11. Open items to tune in the bay
1. Confirm GCQuad club-data add-on status (A4 contact vs fallback).
2. Validate A2/A3/A4 windows against real adult/senior scatter.
3. Set senior speed-retention tolerance (% of baseline).
4. Mental domain self-only or self + coach-observed.
5. Set the auto default order in §9.1 (event-goal vs booked-session).
