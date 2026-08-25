# Overload PT

**Live preview: [jfeldman9-rgb.github.io/overload-pt](https://jfeldman9-rgb.github.io/overload-pt/)**
— open it on a phone. It seeds a demo clinic, so there is something to look at
immediately, and Settings → Reset puts it back.

A mobile-first progressive overload tracker for a physical therapy clinic. It combines Hevy's
set-logging grid with Clank's prescribed rest timer, and adds the things neither app has for
clinical use: a **running notes ledger**, an **explicit change log** of every prescription
adjustment, **movement video you can compare across dates**, **body-metric history**, and a
**backup that runs after every change**.

## Why this exists

Most gym apps assume a solo lifter. This one assumes a clinic:

- **Therapists** prescribe, review, and adjust — including covering for each other.
- **Clients** execute and log during the session, and see only their own chart.
- The app tracks overload across weight, reps, volume, and rest, records *who changed what, when,
  and why*, and keeps the objective measures — video, girths, body composition — next to the
  numbers rather than in a separate app.

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
so it is tracked as a first-class metric and charted per week.

**Therapist home — the ten-second chart review.** A covering therapist walking in cold gets one
screen: red flags (or an explicit *nothing to act on*), last visit with volume delta, peak pain and
its direction, rest compliance and the one-line note; today's plan and pending progressions; the
latest body snapshot and which lifts have a recent clip; and the handoff trail of who changed what
and why.

**Movement video.** Record a short clip from the phone camera against an exercise and a date, then
put any two dates side by side — play them independently or together, at 1×, 0.5×, or 0.25×. Posters
are generated at record time so clip lists are scannable without autoplaying anything. Clips are
capped short (15–30s, default 25s) and stored as blobs in IndexedDB, never in `localStorage`.

**Body metrics.** One log sheet, not a form novel: bodyweight, body fat %, waist, resting HR, and
VO₂ max are always visible; girths, seven caliper sites, and DEXA (total plus regional) are one tap
away. Every field is optional, so a single number is a valid entry. The Body tab charts each field
with week-over-week deltas, and History carries the same composition summary next to training
volume.

**Voice notes.** One big mic control on the workout and on the note sheet. It records audio and
live-transcribes with the browser's own Web Speech API — no cloud key, nothing leaves the device.
On stop the transcript drops into an editable note, attributed and dated. If the recogniser is
missing, blocked, or returns nothing, the app says so and still saves the audio and the note;
losing transcription never loses the note.

**Clinic roster and sharing.** Multiple therapists, multiple clients. A therapist sees their own
caseload plus any chart shared with them; charts nobody shared stay locked, and only the owning
therapist can open sharing. Every sharing change is audited with a reason. The client view is scoped
to their own chart and hides trainer-only notes, including dictated ones marked as clinical
handoff — audio is behind an explicit *Play audio* button, so nobody is made to listen to the room.

**Change tracking.** Every prescription edit, exercise swap, added set, approved progression,
measurement, clip, voice note, and sharing change writes an audit event with actor, field, before
value, after value, and an optional reason.

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

## Storage and backup

**IndexedDB is the source of truth** — for chart data and for video and audio blobs. Every mutation
does two things in order: write locally, then enqueue a remote backup. The status line under the
header always says which of three states the data is in:

| State | Meaning |
|---|---|
| On this device | No cloud target configured. Everything is in IndexedDB and held in the queue. |
| Queued for cloud | Supabase is configured and there is work waiting to upload. |
| Synced | The queue is empty and the last push succeeded. |

It never claims a cloud copy that does not exist. Tap the line for the queue, the last local write,
the last sync, and any error.

**Supabase** is the remote target: Postgres for the structured data, Storage for the media. The SQL
schema, the storage bucket, and the row-level security policies are in
[`supabase/schema.sql`](./supabase/schema.sql), with setup notes in
[`supabase/README.md`](./supabase/README.md). The client reads two variables:

```bash
cp .env.example .env.local   # then fill in
# VITE_SUPABASE_URL=https://<project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon key>
```

Without them the app is fully functional offline. No keys are committed, and only the anon key ever
belongs in a client bundle.

**Export and import** live on the same Backup sheet. Export produces **one `.zip`** holding
`chart.json` plus every video and audio file, and it imports back on any device. It is a two-step
control on purpose: building the bundle has to read media out of IndexedDB, and any `await` spends
the transient activation that both `navigator.share()` and a programmatic download require — which
is why a loop of one-download-per-clip cannot work on an iPhone. Where the browser can share files
(iOS Safari, Android Chrome) the save button hands the file to the OS share sheet, so
*Save to Files* works; elsewhere it falls back to a normal download. A charts-only JSON export is
there too when the media is not wanted, and loose media files from an older export still import.

The archive is written with stored (uncompressed) entries — video is already compressed, so deflate
would cost CPU for nothing — and it is a normal zip that `unzip` and any archive tool will open.

A chart written by the earlier localStorage-only version is migrated automatically on first load.

## Running it

```bash
npm install
npm run dev
```

Open the printed URL on your phone (same Wi-Fi), or use browser devtools in mobile viewport. On iOS
and Android you can "Add to Home Screen" — a web manifest is included, so it launches full-screen
with safe-area insets respected. Camera and microphone capture need a secure context, so use
`https` or `localhost`.

```bash
npm run build     # typecheck + production build
npm run lint      # oxlint
npm run test      # builds, then runs Playwright end-to-end tests (phone viewport)
npm run preview   # serve the production build
```

`npm test` builds first on purpose: Playwright serves the production bundle, so a stale `dist`
would quietly test old code.

The tests cover the behavior that is easiest to get subtly wrong: that the countdown advances on
its own, that `+15s` / `−15s` move it by exactly 15, that it flips to counting up past zero, that
skipping rest writes the measured gap onto the preceding set, that the timer dock never covers the
bottom navigation, and that an approved progression updates the prescription and lands in the
change log. On top of that: logging a measurement and seeing it and its trend on Body and History,
opening the compare view from an exercise, recording a real clip through Chromium's fake capture
device and finding it again after a reload (which is what proves IndexedDB is doing the work),
backup status reporting on-device only when no keys are set, every change landing in the queue, a
second therapist opening a shared chart, sharing revocation locking it again, the patient view
hiding trainer-only notes, and a dictated note surviving a browser with no microphone.

To re-record the product walkthrough video:

```bash
npx playwright test --config playwright.demo.config.ts   # writes demo-output/**/video.webm
```

## Publishing the preview

The live preview is the `gh-pages` branch, served from the repository root at
`/overload-pt/`, which is why `vite.config.ts` sets `base: '/overload-pt/'`.

```bash
npm run build
git worktree add /tmp/ghp gh-pages
cd /tmp/ghp && git rm -rq . && cp -R /path/to/dist/. .
touch .nojekyll          # stop Pages from processing assets/
cp index.html 404.html   # a refresh on any path lands on the app
git add -A && git commit -m "Publish preview" && git push origin gh-pages
```

`.nojekyll` and the `404.html` copy are both required: without the first, Pages
ignores paths Jekyll considers private, and without the second a refresh or a
deep link gets a Pages error page instead of the app.

## Trying the demo data

The app seeds a two-therapist, two-client clinic:

- **Alex M.** — 14 weeks post ACL reconstruction, owned by Dana R., DPT and shared with the clinic.
  Five completed sessions across two program days, seven notes including a trainer-only handoff and
  a dictated one, four prescription changes, fifteen weeks of weekly body metrics with calipers at
  three points and two DEXA scans, and five movement clips across three lifts.
- **Marcus T.** — supraspinatus tendinopathy returning to golf, owned by Priya N., DPT, OCS and
  *not* shared, so the permission model is visible rather than decorative. His last session is a
  deliberate flare: load went up, pain went 3 → 6, rest ran long. He is the chart that shows red
  flags working.

Tap the name under the title to switch therapist or open another chart. Use the **Patient /
Trainer** switch to see the client's side; notes marked clinical are hidden there. Settings → Reset
restores the demo data.

Movement clips in the seed are labelled **Demo** and carry a generated placeholder frame rather than
a video file — the repository ships no binary media. Record over them to see real playback.

## Project layout

```
src/
  data/exercises.ts    Exercise library + ranked search
  lib/overload.ts      Volume, e1RM, stall detection, progression suggestions
  lib/review.ts        Chart-review derivations: red flags, last visit, clip recency, weekly rollup
  lib/metrics.ts       Body-metric series, deltas, caliper and DEXA helpers
  lib/idb.ts           IndexedDB wrapper: chart document, media blobs, outbox
  lib/backup.ts        Local write + remote queue, and the status the UI reports
  lib/supabase.ts      REST and Storage calls, and nothing else
  lib/media.ts         Recorder capability checks, posters, blob URLs
  lib/format.ts        Duration, date, and weight formatting
  hooks/useRestTimer   Timestamp-driven rest timer with haptics and alerts
  store/               Clinic state, chart access rules, audit logging
  components/          Set grid, rest timer dock, video recorder and compare, voice note,
                       body metric log sheet, charts and tiles, roster, backup bar
  screens/             Home, Active workout, Program editor, History, Body, Settings
  types.ts             Domain model
supabase/              SQL schema, RLS policies, storage bucket, setup notes
```

## Notes on the data model

`AppState` holds the clinic: `therapists`, `clients`, the acting therapist, and the open chart. Each
`ClientRecord` owns its own program, sessions, notes, audit trail, body metrics, movement clips, and
voice notes — the same shape the Supabase `charts` table stores as `jsonb`, so a backup is a copy
rather than a translation.

`Session` holds `ExerciseEntry[]`, each with its own `SetLog[]`. Entries snapshot their prescription
targets at session start, so editing the program later never rewrites history. `AuditEvent` is
polymorphic over prescriptions, program days, sessions, sets, measurements, media, and sharing, and
carries the writing member's id so a handoff is traceable to a person.

Media metadata (poster, duration, label, byte size, backup state) lives in the chart document;
the bytes live in the IndexedDB blob store under the key the metadata points to. That keeps the
document small enough to serialise on every change while the blobs stay out of the JSON.

## Where to take it next

- Therapist sign-in, so the Supabase policies scope to real auth users instead of the anon key
- Multi-patient roster at clinic scale, with caseload assignment
- ROM (degrees) as a tracked metric alongside pain and RPE
- Frame-by-frame scrub and on-video angle overlays in the compare view
- PDF session export for records
