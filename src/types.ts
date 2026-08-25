export type Role = 'patient' | 'trainer';
export type Units = 'lb' | 'kg';

/** How a movement is measured. Rehab work is often time- or rep-only. */
export type Metric = 'weight_reps' | 'reps' | 'time' | 'time_weight' | 'distance_time';

export type Tier = 'rehab' | 'strength' | 'general' | 'mobility' | 'conditioning';

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  primary: string;
  equipment: string;
  pattern: string;
  tier: Tier;
  metric: Metric;
  defaultRestSec: number;
  tags: string[];
  custom?: boolean;
}

export type ProgressionType = 'double' | 'linear' | 'reps' | 'none';

export interface ProgressionRule {
  type: ProgressionType;
  /** Weight added when the success criteria are met. */
  increment: number;
  /** Rehab gate: skip the increase if reported pain exceeded this value. */
  gatePainMax?: number | null;
  /** Flag a deload after this many stalled sessions. */
  stallLimit: number;
}

export interface Prescription {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: number;
  /** Upper bound of the rep range; enables double progression. */
  targetRepsMax: number | null;
  targetWeight: number;
  restSec: number;
  progression: ProgressionRule;
  cue: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  prescriptions: Prescription[];
}

export interface Program {
  id: string;
  name: string;
  days: ProgramDay[];
}

export interface SetLog {
  id: string;
  setNumber: number;
  weight: number;
  reps: number;
  restPrescribedSec: number;
  /** Measured gap between finishing the previous set and starting this one. */
  restActualSec: number | null;
  completed: boolean;
  completedAt: string | null;
  rpe: number | null;
  pain: number | null;
}

export interface ExerciseEntry {
  id: string;
  exerciseId: string;
  prescriptionId: string | null;
  targetReps: number;
  targetRepsMax: number | null;
  targetWeight: number;
  restSec: number;
  cue: string;
  note: string;
  sets: SetLog[];
}

export type SessionStatus = 'active' | 'completed';

export interface Session {
  id: string;
  name: string;
  programDayId: string | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  entries: ExerciseEntry[];
}

export type NoteScope = 'session' | 'exercise';

export interface Note {
  id: string;
  scope: NoteScope;
  sessionId: string | null;
  exerciseId: string | null;
  author: Role;
  authorName: string;
  body: string;
  createdAt: string;
  /** Clinical notes the patient should not see in their own view. */
  trainerOnly: boolean;
}

export type AuditEntity =
  | 'prescription'
  | 'program_day'
  | 'session'
  | 'set'
  | 'exercise_swap'
  | 'settings';

export interface AuditEvent {
  id: string;
  at: string;
  actor: Role | 'system';
  actorName: string;
  entity: AuditEntity;
  entityLabel: string;
  field: string;
  from: string | number | null;
  to: string | number | null;
  reason: string | null;
  sessionId: string | null;
}

export interface Settings {
  units: Units;
  autoStartRest: boolean;
  restAlerts: boolean;
  clinicalFields: boolean;
}

export interface AppState {
  version: number;
  role: Role;
  patientName: string;
  trainerName: string;
  settings: Settings;
  program: Program;
  sessions: Session[];
  notes: Note[];
  audit: AuditEvent[];
  customExercises: Exercise[];
  favorites: string[];
  recentExercises: string[];
}

/** A progression suggestion awaiting trainer approval. */
export interface Suggestion {
  id: string;
  prescriptionId: string;
  exerciseId: string;
  kind: 'increase_weight' | 'increase_reps' | 'deload' | 'hold';
  field: 'targetWeight' | 'targetReps';
  from: number;
  to: number;
  rationale: string;
}
