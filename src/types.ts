export type Role = 'patient' | 'trainer';
export type Units = 'lb' | 'kg';
export type LengthUnits = 'in' | 'cm';

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
  /** Clinic member who wrote it, so a handoff can be traced to a person. */
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Clinical notes the patient should not see in their own view. */
  trainerOnly: boolean;
  /** Set when the note came out of a dictated voice note. */
  voiceNoteId?: string | null;
}

export type AuditEntity =
  | 'prescription'
  | 'program_day'
  | 'session'
  | 'set'
  | 'exercise_swap'
  | 'settings'
  | 'body_metric'
  | 'clip'
  | 'voice_note'
  | 'sharing';

export interface AuditEvent {
  id: string;
  at: string;
  actor: Role | 'system';
  /** Clinic member id — the handoff trail depends on this being real. */
  actorId: string;
  actorName: string;
  entity: AuditEntity;
  entityLabel: string;
  field: string;
  from: string | number | null;
  to: string | number | null;
  reason: string | null;
  sessionId: string | null;
}

/* ── Clinic roster ──────────────────────────────────────────────────── */

export interface Therapist {
  id: string;
  name: string;
  credential: string;
}

/* ── Body metrics ───────────────────────────────────────────────────── */

/** Jackson–Pollock style skinfold sites, in millimetres. */
export interface CaliperSites {
  chest: number | null;
  abdominal: number | null;
  thigh: number | null;
  suprailiac: number | null;
  triceps: number | null;
  subscapular: number | null;
  midaxillary: number | null;
}

/** DEXA total plus the regional numbers worth trending. */
export interface DexaScan {
  totalFatPct: number | null;
  leanMassLb: number | null;
  fatMassLb: number | null;
  visceralFatLb: number | null;
  trunkFatPct: number | null;
  armsLeanLb: number | null;
  legsLeanLb: number | null;
}

export interface BodyMetric {
  id: string;
  clientId: string;
  /** Date of measurement, not of entry. */
  at: string;
  bodyweight: number | null;
  bodyFatPct: number | null;
  waist: number | null;
  hip: number | null;
  thigh: number | null;
  arm: number | null;
  restingHr: number | null;
  vo2max: number | null;
  calipers: CaliperSites;
  dexa: DexaScan | null;
  note: string;
  units: Units;
  lengthUnits: LengthUnits;
  loggedBy: Role;
  loggedById: string;
  loggedByName: string;
}

export type BodyMetricField =
  | 'bodyweight'
  | 'bodyFatPct'
  | 'waist'
  | 'hip'
  | 'thigh'
  | 'arm'
  | 'restingHr'
  | 'vo2max';

/* ── Media ──────────────────────────────────────────────────────────── */

/** Where a piece of data currently lives. Never claim more than is true. */
export type BackupState = 'local' | 'queued' | 'synced';

export interface MovementClip {
  id: string;
  clientId: string;
  exerciseId: string;
  sessionId: string | null;
  /**
   * The set this clip was filmed on, when it was filmed from the set row.
   * Null for clips attached to the exercise as a whole, including anything
   * recorded before per-set filming existed.
   */
  setId?: string | null;
  recordedAt: string;
  durationSec: number;
  mimeType: string;
  byteSize: number;
  /** IndexedDB blob key. Null for the seeded demo placeholders. */
  blobKey: string | null;
  /** Tiny data-URL still so the list is scannable without autoplaying. */
  posterUrl: string;
  label: string;
  note: string;
  recordedBy: Role;
  recordedById: string;
  recordedByName: string;
  /** Demo row with no video data behind it. */
  placeholder?: boolean;
  backup: BackupState;
}

export interface VoiceNote {
  id: string;
  clientId: string;
  sessionId: string | null;
  exerciseId: string | null;
  at: string;
  durationSec: number;
  /** Raw output of the browser recognizer, kept verbatim for the chart. */
  transcript: string;
  /** Edited text that becomes the shared note body. */
  cleaned: string;
  blobKey: string | null;
  mimeType: string;
  transcriptionSupported: boolean;
  authorRole: Role;
  authorId: string;
  authorName: string;
  trainerOnly: boolean;
  noteId: string | null;
  backup: BackupState;
}

/* ── Client chart ───────────────────────────────────────────────────── */

export interface ClientRecord {
  id: string;
  name: string;
  condition: string;
  /** Owning therapist. Their caseload. */
  therapistId: string;
  /** Colleagues explicitly granted access to the chart. */
  sharedTherapistIds: string[];
  /** Open to every therapist in the clinic (covering shifts, handoffs). */
  sharedWithClinic: boolean;
  program: Program;
  sessions: Session[];
  notes: Note[];
  audit: AuditEvent[];
  bodyMetrics: BodyMetric[];
  clips: MovementClip[];
  voiceNotes: VoiceNote[];
  favorites: string[];
  recentExercises: string[];
}

export interface Settings {
  units: Units;
  lengthUnits: LengthUnits;
  autoStartRest: boolean;
  restAlerts: boolean;
  clinicalFields: boolean;
  /** Hard cap on movement clip length. Short clips stay reviewable. */
  clipMaxSec: number;
}

export interface AppState {
  version: number;
  clinicName: string;
  therapists: Therapist[];
  clients: ClientRecord[];
  /** Patient or trainer view. The switch Jason already uses. */
  role: Role;
  /** Signed-in therapist. Every trainer-side write is attributed to them. */
  actingTherapistId: string;
  /** Chart currently open. */
  activeClientId: string;
  settings: Settings;
  customExercises: Exercise[];
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

/* ── Backup ─────────────────────────────────────────────────────────── */

export type OutboxKind = 'chart' | 'clip' | 'voice';

export interface OutboxItem {
  id: string;
  at: string;
  kind: OutboxKind;
  summary: string;
  clientId: string | null;
  blobKey: string | null;
  attempts: number;
  lastError: string | null;
}

export type SyncPhase = 'unconfigured' | 'idle' | 'syncing' | 'error';

export interface BackupStatus {
  /** True only when both Supabase env vars are present. */
  configured: boolean;
  phase: SyncPhase;
  pending: number;
  lastLocalWriteAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}
