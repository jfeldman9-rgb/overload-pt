import { createContext, useContext } from 'react';
import type {
  AppState,
  Exercise,
  Note,
  Prescription,
  Role,
  Session,
  SetLog,
  Settings,
  Suggestion,
} from '../types';

export interface AppContextValue {
  state: AppState;
  exerciseIndex: Map<string, Exercise>;
  allExercises: Exercise[];
  activeSession: Session | null;
  lastCompletedSession: Session | null;
  exerciseName: (id: string) => string;

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
  }) => void;
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

  addCustomExercise: (exercise: Exercise) => void;
  toggleFavorite: (exerciseId: string) => void;
  resetData: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
