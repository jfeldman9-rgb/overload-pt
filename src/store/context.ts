import { createContext, useContext } from 'react';
import type {
  AppState,
  AuditEvent,
  BackupStatus,
  BodyMetric,
  ClientRecord,
  Exercise,
  MovementClip,
  Note,
  Prescription,
  Program,
  Role,
  Session,
  SetLog,
  Settings,
  Suggestion,
  Therapist,
  VoiceNote,
} from '../types';

/** Who is writing. Every mutation is attributed to one of these. */
export interface Actor {
  role: Role;
  id: string;
  name: string;
}

export interface NewBodyMetric {
  at: string;
  bodyweight: number | null;
  bodyFatPct: number | null;
  waist: number | null;
  hip: number | null;
  thigh: number | null;
  arm: number | null;
  restingHr: number | null;
  vo2max: number | null;
  calipers: BodyMetric['calipers'];
  dexa: BodyMetric['dexa'];
  note: string;
}

export interface NewClip {
  exerciseId: string;
  sessionId: string | null;
  durationSec: number;
  mimeType: string;
  posterUrl: string;
  label: string;
  note: string;
}

export interface NewVoiceNote {
  sessionId: string | null;
  exerciseId: string | null;
  durationSec: number;
  transcript: string;
  cleaned: string;
  mimeType: string;
  transcriptionSupported: boolean;
  trainerOnly: boolean;
}

export interface AppContextValue {
  /** Null until IndexedDB has been read. */
  hydrated: boolean;
  state: AppState;
  exerciseIndex: Map<string, Exercise>;
  allExercises: Exercise[];
  exerciseName: (id: string) => string;

  /* Clinic */
  therapists: Therapist[];
  actingTherapist: Therapist;
  actor: Actor;
  /** Charts the signed-in therapist may open (own caseload + shared). */
  visibleClients: ClientRecord[];
  /** Charts in the clinic that are not shared with them. */
  lockedClients: ClientRecord[];
  client: ClientRecord;
  /** False when a colleague opened a chart they can read but not own. */
  isOwningTherapist: boolean;
  canEdit: boolean;
  setActingTherapist: (id: string) => void;
  setActiveClient: (id: string) => void;
  setShareWithClinic: (clientId: string, shared: boolean, reason?: string) => void;
  setShareWithTherapist: (clientId: string, therapistId: string, shared: boolean) => void;

  /* Active chart, already scoped and permission-filtered */
  program: Program;
  sessions: Session[];
  /** Trainer-only notes are removed in the patient view. */
  notes: Note[];
  audit: AuditEvent[];
  bodyMetrics: BodyMetric[];
  clips: MovementClip[];
  voiceNotes: VoiceNote[];
  activeSession: Session | null;
  lastCompletedSession: Session | null;

  setRole: (role: Role) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  startSession: (dayId: string) => string;
  endSession: () => void;
  discardSession: () => void;

  updateSet: (entryId: string, setId: string, patch: Partial<SetLog>) => void;
  toggleSetComplete: (entryId: string, setId: string, restActualSec: number | null) => void;
  addSet: (entryId: string) => void;
  removeSet: (entryId: string, setId: string) => void;

  addExerciseToSession: (exerciseId: string) => void;
  removeEntry: (entryId: string) => void;
  swapEntryExercise: (entryId: string, exerciseId: string) => void;
  setEntryNote: (entryId: string, note: string) => void;

  addNote: (input: {
    body: string;
    scope: Note['scope'];
    sessionId?: string | null;
    exerciseId?: string | null;
    trainerOnly?: boolean;
    voiceNoteId?: string | null;
  }) => string;
  deleteNote: (id: string) => void;

  updatePrescription: (
    dayId: string,
    prescriptionId: string,
    patch: Partial<Prescription>,
    reason?: string,
  ) => void;
  addPrescription: (dayId: string, exerciseId: string) => void;
  removePrescription: (dayId: string, prescriptionId: string) => void;
  applySuggestion: (dayId: string, suggestion: Suggestion) => void;

  /* Body metrics */
  addBodyMetric: (input: NewBodyMetric) => void;
  deleteBodyMetric: (id: string) => void;

  /* Media */
  addClip: (input: NewClip, blob: Blob) => Promise<void>;
  deleteClip: (id: string) => Promise<void>;
  setClipNote: (id: string, note: string) => void;
  addVoiceNote: (input: NewVoiceNote, blob: Blob | null) => Promise<void>;
  deleteVoiceNote: (id: string) => Promise<void>;

  addCustomExercise: (exercise: Exercise) => void;
  toggleFavorite: (exerciseId: string) => void;
  resetData: () => void;

  /* Backup */
  backupStatus: BackupStatus;
  retryBackup: () => Promise<void>;
  exportChartJson: () => void;
  exportMediaFiles: () => Promise<number>;
  importChartJson: (file: File) => Promise<string>;
  importMediaFiles: (files: FileList) => Promise<number>;
}

/**
 * Chart access rule, in one place: the owning therapist, anyone the owner
 * named, or every therapist in the clinic once the chart is shared clinic-wide.
 */
export function canAccessChart(client: ClientRecord, therapistId: string): boolean {
  return (
    client.therapistId === therapistId ||
    client.sharedWithClinic ||
    client.sharedTherapistIds.includes(therapistId)
  );
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
