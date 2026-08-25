# Overload PT

A mobile-first progressive overload workout tracker built for a physical therapist and patient to
track together. It combines Hevy's set-logging grid with Clank's prescribed rest timer, and adds the
two things neither app has for clinical use: a **running notes ledger** and an **explicit change
log** of every prescription adjustment.

## Why this exists

Most gym apps assume a solo lifter. This one assumes two people:

- The **trainer** prescribes the program, reviews history, and adjusts loads.
- The **patient** executes and logs during the session.
- The app tracks overload across weight, reps, volume, and rest — and records *who changed what,
  when, and why*.

## Core features

**Set grid with reps in their own column.** Every set is a row: set number, weight, reps, rest, and
a completion check. Weight and reps have `+`/`−` steppers sized for one-thumb use mid-set.

**Clank-style rest timer.** The prescribed rest is on screen the entire time in large numerals, in a
docked bar that never scrolls away. It auto-starts when a set is checked off, vibrates and chimes at
zero, and keeps counting *up* past zero (`+0:14`) instead of vanishing. `+15s` / `−15s` / skip are
all one tap. The countdown is computed from wall-clock timestamps, so locking the phone or
backgrounding the tab cannot make it drift.

**Prescribed vs actual rest.** Each row shows the rest actually taken, color-coded against what was
prescribed — green under, amber over. Reducing rest at the same load is itself a form of overload,
so it is tracked as a first-class metric.

**Trainer landing screen.** Opening the app as the trainer shows the pinned note from the last
workout, then the full ledger of every prior note (trainer and patient, attributed and dated), the
last session's volume/sets/reps with a delta against the previous comparable day, and any pending
progression suggestions.

**Change tracking.** Every prescription edit, exercise swap, added set, and approved progression
writes an audit event with actor, field, before value, after value, and an optional reason. Visible
on the home screen and in full under History → Changes.

**Progressive overload engine.** Per-exercise rules the trainer controls:

| Rule | Behavior |
|------|----------|
| Double progression | Climb to the top of the rep range, then add load |
| Linear | Add a fixed increment on every successful session |
| Reps only | Increase target reps, hold load (bodyweight/rehab work) |
| Hold | No auto-progression |

Rules produce **suggestions**, never silent changes. A rehab **pain gate** blocks a suggested
increase when reported pain exceeded the threshold, and a stall counter proposes a 10% deload after
N flat sessions.

**Exercise library.** ~450 movements spanning rehab/PT (knee, hip, ankle, shoulder, spine,
wrist/elbow, balance and proprioception), strength, conditioning, and mobility. Ranked search across
names and aliases (`RDL` finds Romanian Deadlift), filters by tier/muscle/equipment, favorites,
recents, and clinic-specific custom exercises.

**Clinical fields.** Optional pain (0–10) and RPE (0–10) per exercise, feeding the progression pain
gate. Toggle off in Settings for non-clinical use.

**Offline-first.** All state persists to `localStorage`, so the app works with no signal in a clinic
or gym. Data is exportable as JSON from Settings.

## Running it

```bash
npm install
npm run dev
```

Open the printed URL on your phone (same Wi-Fi), or use browser devtools in mobile viewport. On iOS
and Android you can "Add to Home Screen" — a web manifest is included, so it launches full-screen
with safe-area insets respected.

```bash
npm run build     # typecheck + production build
npm run lint      # oxlint
npm run test      # Playwright end-to-end tests (phone viewport)
npm run preview   # serve the production build
```

The tests cover the behavior that is easiest to get subtly wrong: that the countdown advances on
its own, that `+15s` / `−15s` move it by exactly 15, that it flips to counting up past zero, that
skipping rest writes the measured gap onto the preceding set, that the timer dock never covers the
bottom navigation, and that an approved progression updates the prescription and lands in the
change log.

To re-record the product walkthrough video:

```bash
npx playwright test --config playwright.demo.config.ts   # writes demo-output/**/video.webm
```

## Trying the demo data

The app seeds with a realistic three-day rehab program, three completed sessions, five notes across
trainer and patient, and four prior prescription changes — enough to see the ledger, the change log,
and the progression suggestions working immediately. Settings → Reset restores it.

Use the **Patient / Trainer** switch in the header to see both sides. Notes marked clinical are
hidden from the patient view.

## Project layout

```
src/
  data/exercises.ts    Exercise library + ranked search
  lib/overload.ts      Volume, e1RM, stall detection, progression suggestions
  lib/format.ts        Duration, date, and weight formatting
  hooks/useRestTimer   Timestamp-driven rest timer with haptics and alerts
  store/               State, localStorage persistence, audit logging
  components/          Set grid, rest timer dock, exercise picker, ledger, change log
  screens/             Home, Active workout, Program editor, History, Settings
  types.ts             Domain model
```

## Notes on the data model

`Session` holds `ExerciseEntry[]`, each with its own `SetLog[]`. Entries snapshot their prescription
targets at session start, so editing the program later never rewrites history. `AuditEvent` is
polymorphic over prescriptions, program days, sessions, and sets.

## Where to take it next

- Sync backend with per-patient row-level security (Supabase or Firebase), so the trainer can review
  between visits from a laptop
- Multi-patient roster for a PT caseload
- ROM (degrees) as a tracked metric alongside pain and RPE
- Video and cue links per exercise
- PDF session export for records
