/**
 * Derivations behind the ten-second chart review.
 *
 * A covering therapist gets one screen. Everything on it is computed here so
 * the screen stays a layout and the judgement calls stay testable.
 */

import type {
  AuditEvent,
  ClientRecord,
  Exercise,
  MovementClip,
  Note,
  Session,
} from '../types';
import {
  completedSets,
  entryMaxPain,
  exerciseHistory,
  sessionVolume,
  stalledSessions,
  summarizeSession,
} from './overload';
import { metricDelta } from './metrics';

export function completedSessions(client: ClientRecord): Session[] {
  return [...client.sessions]
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function maxSessionPain(session: Session): number | null {
  const values = session.entries
    .map((e) => entryMaxPain(e))
    .filter((v): v is number => typeof v === 'number');
  return values.length ? Math.max(...values) : null;
}

export interface RestCompliance {
  prescribedSec: number;
  actualSec: number;
  /** 100 means exactly as prescribed; 130 means a third longer. */
  pct: number;
  samples: number;
}

/**
 * Rest compliance across every set that recorded a measured gap. Rest is a
 * prescription like load is, so drifting off it belongs on the review screen.
 */
export function restCompliance(session: Session): RestCompliance | null {
  let prescribed = 0;
  let actual = 0;
  let samples = 0;
  for (const entry of session.entries) {
    for (const set of entry.sets) {
      if (set.restActualSec == null || !set.restPrescribedSec) continue;
      prescribed += set.restPrescribedSec;
      actual += set.restActualSec;
      samples += 1;
    }
  }
  if (!samples) return null;
  return {
    prescribedSec: Math.round(prescribed / samples),
    actualSec: Math.round(actual / samples),
    pct: Math.round((actual / prescribed) * 100),
    samples,
  };
}

export function restComplianceLabel(compliance: RestCompliance | null): string {
  if (!compliance) return 'not measured';
  if (compliance.pct <= 105 && compliance.pct >= 90) return 'on prescription';
  if (compliance.pct > 105) return `${compliance.pct - 100}% long`;
  return `${100 - compliance.pct}% short`;
}

export interface VisitReview {
  session: Session;
  volume: number;
  volumeDelta: number | null;
  sets: number;
  reps: number;
  prCount: number;
  pain: number | null;
  painDelta: number | null;
  rest: RestCompliance | null;
  headline: string;
}

/** Last completed visit, already diffed against the prior comparable day. */
export function lastVisitReview(client: ClientRecord, visibleNotes: Note[]): VisitReview | null {
  const done = completedSessions(client);
  const session = done[0];
  if (!session) return null;

  const summary = summarizeSession(session, client.sessions);
  const prior = done.find((s) => s.id !== session.id && s.programDayId === session.programDayId);
  const pain = maxSessionPain(session);
  const priorPain = prior ? maxSessionPain(prior) : null;

  const note = visibleNotes
    .filter((n) => n.sessionId === session.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  return {
    session,
    volume: summary.volume,
    volumeDelta: summary.volumeDelta,
    sets: summary.sets,
    reps: summary.reps,
    prCount: summary.prCount,
    pain,
    painDelta: pain != null && priorPain != null ? pain - priorPain : null,
    rest: restCompliance(session),
    headline: note ? firstLine(note.body) : '',
  };
}

export function firstLine(body: string, maxChars = 120): string {
  const line = body.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? body.trim();
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
}

/* ── Movement video recency ─────────────────────────────────────────── */

export interface ClipRecency {
  exerciseId: string;
  name: string;
  clipCount: number;
  lastAt: string | null;
  daysAgo: number | null;
  /** No clip at all, or the newest one predates the last two visits. */
  stale: boolean;
}

export function clipRecency(
  client: ClientRecord,
  exerciseIndex: Map<string, Exercise>,
  staleAfterDays = 21,
  limit = 6,
): ClipRecency[] {
  const now = Date.now();
  // Key lifts = the loaded prescriptions the trainer is progressing.
  const keyIds: string[] = [];
  for (const day of client.program.days) {
    for (const p of [...day.prescriptions].sort((a, b) => a.order - b.order)) {
      if (!keyIds.includes(p.exerciseId)) keyIds.push(p.exerciseId);
    }
  }
  const ranked = keyIds
    .map((id) => ({ id, sessions: exerciseHistory(client.sessions, id).length }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);

  return ranked.map(({ id }) => {
    const clips = client.clips
      .filter((c) => c.exerciseId === id)
      .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
    const lastAt = clips[0]?.recordedAt ?? null;
    const daysAgo = lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 86_400_000) : null;
    return {
      exerciseId: id,
      name: exerciseIndex.get(id)?.name ?? id,
      clipCount: clips.length,
      lastAt,
      daysAgo,
      stale: daysAgo == null || daysAgo > staleAfterDays,
    };
  });
}

export function clipsForExercise(clips: MovementClip[], exerciseId: string): MovementClip[] {
  return clips
    .filter((c) => c.exerciseId === exerciseId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
}

export function clipsForSet(clips: MovementClip[], setId: string): MovementClip[] {
  return clips
    .filter((c) => c.setId === setId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
}

export interface FilmedMovement {
  exerciseId: string;
  clips: MovementClip[];
  latestAt: string;
  /** Distinct calendar days with a clip — the thing being compared. */
  dayCount: number;
}

/**
 * Every movement that has been filmed, newest first. The review surface is
 * organised by movement rather than by session, because the question is
 * "how does this lift look now against last month", not "what happened on
 * the 16th".
 */
export function filmedMovements(clips: MovementClip[]): FilmedMovement[] {
  const byExercise = new Map<string, MovementClip[]>();
  for (const clip of clips) {
    const list = byExercise.get(clip.exerciseId);
    if (list) list.push(clip);
    else byExercise.set(clip.exerciseId, [clip]);
  }
  return [...byExercise.entries()]
    .map(([exerciseId, list]) => {
      const sorted = [...list].sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
      return {
        exerciseId,
        clips: sorted,
        latestAt: sorted[0].recordedAt,
        dayCount: new Set(sorted.map((c) => c.recordedAt.slice(0, 10))).size,
      };
    })
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
}

/* ── Red flags ──────────────────────────────────────────────────────── */

export type FlagSeverity = 'high' | 'medium';

export interface RedFlag {
  id: string;
  severity: FlagSeverity;
  label: string;
  detail: string;
}

// Deliberately excludes plain soreness: post-session DOMS is expected and
// flagging it would bury the notes that matter.
const CONCERN_WORDS =
  /\b(pain|painful|swell|swelling|effusion|rom|range of motion|giving way|gave way|catching|locked|numb|tingl|flare|flaring|instability|unstable)\w*/i;

/**
 * Only things a therapist would act on. Deliberately short: pain trending up,
 * a gap in attendance, a lift that has stopped moving, and any new note that
 * mentions pain or range of motion since the last visit.
 */
export function redFlags(
  client: ClientRecord,
  exerciseIndex: Map<string, Exercise>,
  visibleNotes: Note[],
): RedFlag[] {
  const flags: RedFlag[] = [];
  const done = completedSessions(client);
  const last = done[0];

  if (last) {
    const prior = done.find((s) => s.id !== last.id && s.programDayId === last.programDayId);
    const pain = maxSessionPain(last);
    const priorPain = prior ? maxSessionPain(prior) : null;
    if (pain != null && priorPain != null && pain - priorPain >= 2) {
      flags.push({
        id: 'pain-up',
        severity: 'high',
        label: `Pain up ${pain - priorPain} points`,
        detail: `${priorPain}/10 → ${pain}/10 on ${last.name.split('—')[0].trim()}.`,
      });
    } else if (pain != null && pain >= 6) {
      flags.push({
        id: 'pain-high',
        severity: 'high',
        label: `Pain ${pain}/10 last visit`,
        detail: 'Above the usual progression gate — review load before adding.',
      });
    }

    const daysSince = Math.floor((Date.now() - new Date(last.startedAt).getTime()) / 86_400_000);
    const cadence = typicalCadenceDays(done);
    if (cadence != null && daysSince > Math.max(10, cadence * 2)) {
      flags.push({
        id: 'missed',
        severity: 'medium',
        label: `${daysSince} days since last session`,
        detail: `Usual cadence is about every ${cadence} days.`,
      });
    }

    const rest = restCompliance(last);
    if (rest && rest.pct >= 140) {
      flags.push({
        id: 'rest-drift',
        severity: 'medium',
        label: `Rest ran ${rest.pct - 100}% long`,
        detail: `${rest.actualSec}s taken against ${rest.prescribedSec}s prescribed.`,
      });
    }
  }

  const stalled: string[] = [];
  for (const day of client.program.days) {
    for (const p of day.prescriptions) {
      if (p.progression.type === 'none' || p.targetWeight <= 0) continue;
      if (stalledSessions(client.sessions, p.exerciseId) >= p.progression.stallLimit) {
        const name = exerciseIndex.get(p.exerciseId)?.name ?? p.exerciseId;
        if (!stalled.includes(name)) stalled.push(name);
      }
    }
  }
  if (stalled.length) {
    flags.push({
      id: 'stalled',
      severity: 'medium',
      label: `${stalled.length} stalled ${stalled.length === 1 ? 'lift' : 'lifts'}`,
      detail: stalled.slice(0, 3).join(', '),
    });
  }

  // Patient-reported only: a therapist's own note is already in the handoff
  // section, and repeating it here dilutes the flags that need acting on.
  const since = done[1]?.startedAt ?? null;
  const newConcern = visibleNotes
    .filter((n) => n.author === 'patient')
    .filter((n) => (since ? n.createdAt > since : true))
    .filter((n) => CONCERN_WORDS.test(n.body))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (newConcern) {
    flags.push({
      id: 'note-concern',
      severity: 'medium',
      label: `New pain/ROM report — ${newConcern.authorName}`,
      detail: firstLine(newConcern.body, 100),
    });
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

/** Median gap between recent sessions, used to judge a missed visit. */
export function typicalCadenceDays(sessionsDesc: Session[]): number | null {
  if (sessionsDesc.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 0; i < Math.min(sessionsDesc.length - 1, 6); i++) {
    const gap =
      (new Date(sessionsDesc[i].startedAt).getTime() -
        new Date(sessionsDesc[i + 1].startedAt).getTime()) /
      86_400_000;
    if (gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]));
}

/* ── Today's plan ───────────────────────────────────────────────────── */

/**
 * The next day in the program rotation after the last one that was run. A
 * covering therapist should not have to work out where in the block they are.
 */
export function suggestedNextDayId(client: ClientRecord): string | null {
  const days = client.program.days;
  if (!days.length) return null;
  const last = completedSessions(client)[0];
  if (!last?.programDayId) return days[0].id;
  const index = days.findIndex((d) => d.id === last.programDayId);
  if (index < 0) return days[0].id;
  return days[(index + 1) % days.length].id;
}

export function lastRunForDay(client: ClientRecord, dayId: string): string | null {
  return completedSessions(client).find((s) => s.programDayId === dayId)?.startedAt ?? null;
}

/* ── Handoff ────────────────────────────────────────────────────────── */

export function recentChanges(client: ClientRecord, limit = 3): AuditEvent[] {
  return [...client.audit].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

/* ── Weekly rollup ──────────────────────────────────────────────────── */

export interface WeekRollup {
  weekStart: string;
  sessions: number;
  volume: number;
  sets: number;
  maxPain: number | null;
  restPct: number | null;
}

function startOfWeek(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // Monday-based
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function weeklyRollup(client: ClientRecord, weeks = 8): WeekRollup[] {
  const buckets = new Map<string, WeekRollup>();
  for (const session of client.sessions.filter((s) => s.status === 'completed')) {
    const key = startOfWeek(session.startedAt);
    const rest = restCompliance(session);
    const pain = maxSessionPain(session);
    const existing = buckets.get(key);
    if (existing) {
      existing.sessions += 1;
      existing.volume += sessionVolume(session);
      existing.sets += session.entries.reduce((n, e) => n + completedSets(e).length, 0);
      existing.maxPain =
        pain == null ? existing.maxPain : Math.max(existing.maxPain ?? 0, pain);
      existing.restPct =
        rest == null ? existing.restPct : Math.round(((existing.restPct ?? rest.pct) + rest.pct) / 2);
    } else {
      buckets.set(key, {
        weekStart: key,
        sessions: 1,
        volume: sessionVolume(session),
        sets: session.entries.reduce((n, e) => n + completedSets(e).length, 0),
        maxPain: pain,
        restPct: rest?.pct ?? null,
      });
    }
  }
  return [...buckets.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)).slice(-weeks);
}

/* ── Body snapshot ──────────────────────────────────────────────────── */

export interface BodySnapshot {
  at: string;
  lines: Array<{ label: string; value: string; delta: string; tone: 'good' | 'bad' | 'flat' }>;
}

/** Waist / BF% / weight with direction — the three a trainer scans first. */
export function bodySnapshot(client: ClientRecord): BodySnapshot | null {
  if (!client.bodyMetrics.length) return null;
  const latest = [...client.bodyMetrics].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const fields: Array<{ field: 'waist' | 'bodyFatPct' | 'bodyweight'; label: string; better: 'down' | 'neutral' }> = [
    { field: 'waist', label: 'Waist', better: 'down' },
    { field: 'bodyFatPct', label: 'BF%', better: 'down' },
    { field: 'bodyweight', label: 'Weight', better: 'neutral' },
  ];

  const lines = fields.flatMap(({ field, label, better }) => {
    const d = metricDelta(client.bodyMetrics, field);
    if (!d) return [];
    const delta = d.delta;
    const tone: 'good' | 'bad' | 'flat' =
      delta == null || Math.abs(delta) < 0.05 || better === 'neutral'
        ? 'flat'
        : delta < 0
          ? 'good'
          : 'bad';
    return [
      {
        label,
        value: `${Number(d.latest.value.toFixed(1))}`,
        delta:
          delta == null
            ? '—'
            : `${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))}${d.spanDays ? ` / ${d.spanDays}d` : ''}`,
        tone,
      },
    ];
  });

  return { at: latest.at, lines };
}
