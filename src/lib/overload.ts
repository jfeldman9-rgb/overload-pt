import type {
  ExerciseEntry,
  Prescription,
  Session,
  SetLog,
  Suggestion,
} from '../types';
import { uid } from './format';

export function completedSets(entry: ExerciseEntry): SetLog[] {
  return entry.sets.filter((s) => s.completed);
}

export function entryVolume(entry: ExerciseEntry): number {
  return completedSets(entry).reduce((sum, s) => sum + s.weight * s.reps, 0);
}

export function sessionVolume(session: Session): number {
  return session.entries.reduce((sum, e) => sum + entryVolume(e), 0);
}

export function topSet(entry: ExerciseEntry): SetLog | null {
  const done = completedSets(entry);
  if (!done.length) return null;
  return done.reduce((best, s) => (s.weight > best.weight ? s : best));
}

/** Epley estimate, capped at a rep count where the formula stays meaningful. */
export function estimateOneRepMax(weightValue: number, reps: number): number {
  if (!weightValue || !reps) return 0;
  const r = Math.min(reps, 12);
  return Math.round(weightValue * (1 + r / 30));
}

export function entryE1RM(entry: ExerciseEntry): number {
  return completedSets(entry).reduce(
    (best, s) => Math.max(best, estimateOneRepMax(s.weight, s.reps)),
    0,
  );
}

export function averageRest(entry: ExerciseEntry): number | null {
  const values = entry.sets
    .map((s) => s.restActualSec)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function findEntry(session: Session, exerciseId: string): ExerciseEntry | undefined {
  return session.entries.find((e) => e.exerciseId === exerciseId);
}

/** Most recent completed session that contains the given exercise. */
export function lastPerformance(
  sessions: Session[],
  exerciseId: string,
  excludeSessionId?: string,
): { session: Session; entry: ExerciseEntry } | null {
  const candidates = sessions
    .filter((s) => s.status === 'completed' && s.id !== excludeSessionId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const session of candidates) {
    const entry = findEntry(session, exerciseId);
    if (entry && completedSets(entry).length) return { session, entry };
  }
  return null;
}

export interface ExercisePoint {
  date: string;
  sessionId: string;
  volume: number;
  topWeight: number;
  e1rm: number;
  totalReps: number;
  /** Mean rest actually taken, so cutting rest reads as overload too. */
  avgRestSec: number | null;
  prescribedRestSec: number;
  maxPain: number | null;
}

export function exerciseHistory(sessions: Session[], exerciseId: string): ExercisePoint[] {
  return sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    .flatMap((s) => {
      const entry = findEntry(s, exerciseId);
      if (!entry || !completedSets(entry).length) return [];
      const top = topSet(entry);
      return [
        {
          date: s.startedAt,
          sessionId: s.id,
          volume: entryVolume(entry),
          topWeight: top?.weight ?? 0,
          e1rm: entryE1RM(entry),
          totalReps: completedSets(entry).reduce((sum, x) => sum + x.reps, 0),
          avgRestSec: averageRest(entry),
          prescribedRestSec: entry.restSec,
          maxPain: entryMaxPain(entry),
        },
      ];
    });
}

/** True when every prescribed set reached the top of the rep range. */
function hitAllTargets(entry: ExerciseEntry, prescription: Prescription): boolean {
  const done = completedSets(entry);
  if (done.length < prescription.targetSets) return false;
  const goal = prescription.targetRepsMax ?? prescription.targetReps;
  return done.every((s) => s.reps >= goal && s.weight >= prescription.targetWeight);
}

export function entryMaxPain(entry: ExerciseEntry): number | null {
  const values = entry.sets
    .map((s) => s.pain)
    .filter((v): v is number => typeof v === 'number');
  return values.length ? Math.max(...values) : null;
}

/** Consecutive recent sessions with no increase in top weight. */
export function stalledSessions(sessions: Session[], exerciseId: string): number {
  const points = exerciseHistory(sessions, exerciseId);
  if (points.length < 2) return 0;
  let stalls = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (points[i].topWeight <= points[i - 1].topWeight) stalls++;
    else break;
  }
  return stalls;
}

/**
 * Progression suggestions are advisory only — the trainer approves or edits
 * them, and approval is what writes to the audit log.
 */
export function suggestProgression(
  prescription: Prescription,
  sessions: Session[],
  lastSession: Session | null,
): Suggestion | null {
  const rule = prescription.progression;
  if (rule.type === 'none' || !lastSession) return null;

  const entry = findEntry(lastSession, prescription.exerciseId);
  if (!entry || !completedSets(entry).length) return null;

  const pain = entryMaxPain(entry);
  if (rule.gatePainMax != null && pain != null && pain > rule.gatePainMax) {
    return {
      id: uid('sug'),
      prescriptionId: prescription.id,
      exerciseId: prescription.exerciseId,
      kind: 'hold',
      field: 'targetWeight',
      from: prescription.targetWeight,
      to: prescription.targetWeight,
      rationale: `Hold load — reported pain ${pain}/10 exceeded the ${rule.gatePainMax}/10 gate.`,
    };
  }

  const stalls = stalledSessions(sessions, prescription.exerciseId);
  if (stalls >= rule.stallLimit && prescription.targetWeight > 0) {
    const deloaded = Math.max(0, Math.round(prescription.targetWeight * 0.9 * 2) / 2);
    return {
      id: uid('sug'),
      prescriptionId: prescription.id,
      exerciseId: prescription.exerciseId,
      kind: 'deload',
      field: 'targetWeight',
      from: prescription.targetWeight,
      to: deloaded,
      rationale: `Top weight flat for ${stalls} sessions — suggest a 10% deload to rebuild.`,
    };
  }

  if (!hitAllTargets(entry, prescription)) return null;

  if (rule.type === 'reps') {
    return {
      id: uid('sug'),
      prescriptionId: prescription.id,
      exerciseId: prescription.exerciseId,
      kind: 'increase_reps',
      field: 'targetReps',
      from: prescription.targetReps,
      to: prescription.targetReps + 1,
      rationale: 'All sets hit target reps at prescribed load.',
    };
  }

  // Double progression climbs reps to the top of the range before adding load.
  if (rule.type === 'double' && prescription.targetRepsMax) {
    const done = completedSets(entry);
    const belowCeiling = done.some((s) => s.reps < prescription.targetRepsMax!);
    if (belowCeiling) return null;
  }

  return {
    id: uid('sug'),
    prescriptionId: prescription.id,
    exerciseId: prescription.exerciseId,
    kind: 'increase_weight',
    field: 'targetWeight',
    from: prescription.targetWeight,
    to: Math.round((prescription.targetWeight + rule.increment) * 2) / 2,
    rationale:
      rule.type === 'double'
        ? `Hit the top of the rep range on every set — add ${rule.increment}.`
        : `Completed all prescribed sets — linear increase of ${rule.increment}.`,
  };
}

export interface OverloadSummary {
  volume: number;
  volumeDelta: number | null;
  sets: number;
  reps: number;
  prCount: number;
}

export function summarizeSession(session: Session, allSessions: Session[]): OverloadSummary {
  const volume = sessionVolume(session);
  const previous = allSessions
    .filter((s) => s.status === 'completed' && s.id !== session.id && s.programDayId === session.programDayId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];

  let prCount = 0;
  for (const entry of session.entries) {
    const prior = lastPerformance(allSessions, entry.exerciseId, session.id);
    if (!prior) continue;
    if (entryE1RM(entry) > entryE1RM(prior.entry)) prCount++;
  }

  return {
    volume,
    volumeDelta: previous ? volume - sessionVolume(previous) : null,
    sets: session.entries.reduce((n, e) => n + completedSets(e).length, 0),
    reps: session.entries.reduce(
      (n, e) => n + completedSets(e).reduce((r, s) => r + s.reps, 0),
      0,
    ),
    prCount,
  };
}
