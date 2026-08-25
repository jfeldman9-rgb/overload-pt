import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AppState,
  AuditEntity,
  AuditEvent,
  Exercise,
  ExerciseEntry,
  Note,
  Prescription,
  Role,
  Session,
  SetLog,
  Settings,
  Suggestion,
} from '../types';
import { buildExerciseIndex, EXERCISES } from '../data/exercises';
import { uid } from '../lib/format';
import { AppContext, type AppContextValue } from './context';
import { seedState } from './seed';

const STORAGE_KEY = 'overload-pt.v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

interface AuditInput {
  entity: AuditEntity;
  entityLabel: string;
  field: string;
  from: string | number | null;
  to: string | number | null;
  reason?: string | null;
  sessionId?: string | null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const allExercises = useMemo(
    () => [...EXERCISES, ...state.customExercises],
    [state.customExercises],
  );
  const exerciseIndex = useMemo(
    () => buildExerciseIndex(state.customExercises),
    [state.customExercises],
  );

  const exerciseName = useCallback(
    (id: string) => exerciseIndex.get(id)?.name ?? id,
    [exerciseIndex],
  );

  const activeSession = useMemo(
    () => state.sessions.find((s) => s.status === 'active') ?? null,
    [state.sessions],
  );

  const lastCompletedSession = useMemo(() => {
    return (
      state.sessions
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null
    );
  }, [state.sessions]);

  /** Every mutation that changes a prescription or program routes through here. */
  const recordAudit = useCallback((prev: AppState, input: AuditInput): AuditEvent => {
    return {
      id: uid('aud'),
      at: new Date().toISOString(),
      actor: prev.role,
      actorName: prev.role === 'trainer' ? prev.trainerName : prev.patientName,
      entity: input.entity,
      entityLabel: input.entityLabel,
      field: input.field,
      from: input.from,
      to: input.to,
      reason: input.reason ?? null,
      sessionId: input.sessionId ?? null,
    };
  }, []);

  const setRole = useCallback((role: Role) => setState((s) => ({ ...s, role })), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const startSession = useCallback(
    (dayId: string) => {
      const id = uid('ses');
      setState((prev) => {
        const day = prev.program.days.find((d) => d.id === dayId);
        if (!day) return prev;

        const index = buildExerciseIndex(prev.customExercises);
        const entries: ExerciseEntry[] = [...day.prescriptions]
          .sort((a, b) => a.order - b.order)
          .map((p) => ({
            id: uid('en'),
            exerciseId: p.exerciseId,
            prescriptionId: p.id,
            targetReps: p.targetReps,
            targetRepsMax: p.targetRepsMax,
            targetWeight: p.targetWeight,
            restSec: p.restSec || index.get(p.exerciseId)?.defaultRestSec || 60,
            cue: p.cue,
            note: '',
            sets: Array.from({ length: p.targetSets }, (_, i) => ({
              id: uid('set'),
              setNumber: i + 1,
              weight: p.targetWeight,
              reps: p.targetReps,
              restPrescribedSec: p.restSec,
              restActualSec: null,
              completed: false,
              completedAt: null,
              rpe: null,
              pain: null,
            })),
          }));

        const session: Session = {
          id,
          name: day.name,
          programDayId: day.id,
          status: 'active',
          startedAt: new Date().toISOString(),
          endedAt: null,
          entries,
        };

        return { ...prev, sessions: [...prev.sessions, session] };
      });
      return id;
    },
    [],
  );

  const endSession = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.status === 'active'
          ? { ...s, status: 'completed', endedAt: new Date().toISOString() }
          : s,
      ),
    }));
  }, []);

  const discardSession = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.status !== 'active'),
    }));
  }, []);

  /** Applies a change to the active session's entries. */
  const mutateActive = useCallback(
    (fn: (session: Session, prev: AppState) => Session, audit?: (prev: AppState) => AuditInput | null) => {
      setState((prev) => {
        const active = prev.sessions.find((s) => s.status === 'active');
        if (!active) return prev;
        const updated = fn(active, prev);
        const auditInput = audit?.(prev);
        return {
          ...prev,
          sessions: prev.sessions.map((s) => (s.id === active.id ? updated : s)),
          audit: auditInput ? [recordAudit(prev, auditInput), ...prev.audit] : prev.audit,
        };
      });
    },
    [recordAudit],
  );

  const updateSet = useCallback(
    (entryId: string, setId: string, patch: Partial<SetLog>) => {
      mutateActive((session) => ({
        ...session,
        entries: session.entries.map((e) =>
          e.id !== entryId
            ? e
            : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) },
        ),
      }));
    },
    [mutateActive],
  );

  const toggleSetComplete = useCallback(
    (entryId: string, setId: string, restActualSec: number | null) => {
      mutateActive((session) => ({
        ...session,
        entries: session.entries.map((e) => {
          if (e.id !== entryId) return e;
          return {
            ...e,
            sets: e.sets.map((s) => {
              if (s.id !== setId) return s;
              const completed = !s.completed;
              return {
                ...s,
                completed,
                completedAt: completed ? new Date().toISOString() : null,
                restActualSec: completed ? s.restActualSec ?? restActualSec : null,
              };
            }),
          };
        }),
      }));
    },
    [mutateActive],
  );

  const addSet = useCallback(
    (entryId: string) => {
      mutateActive(
        (session) => ({
          ...session,
          entries: session.entries.map((e) => {
            if (e.id !== entryId) return e;
            const last = e.sets[e.sets.length - 1];
            return {
              ...e,
              sets: [
                ...e.sets,
                {
                  id: uid('set'),
                  setNumber: e.sets.length + 1,
                  weight: last?.weight ?? e.targetWeight,
                  reps: last?.reps ?? e.targetReps,
                  restPrescribedSec: e.restSec,
                  restActualSec: null,
                  completed: false,
                  completedAt: null,
                  rpe: null,
                  pain: null,
                },
              ],
            };
          }),
        }),
        (prev) => {
          const active = prev.sessions.find((s) => s.status === 'active');
          const e = active?.entries.find((x) => x.id === entryId);
          if (!e || !active) return null;
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'set',
            entityLabel: index.get(e.exerciseId)?.name ?? e.exerciseId,
            field: 'sets',
            from: e.sets.length,
            to: e.sets.length + 1,
            sessionId: active.id,
          };
        },
      );
    },
    [mutateActive],
  );

  const removeSet = useCallback(
    (entryId: string, setId: string) => {
      mutateActive((session) => ({
        ...session,
        entries: session.entries.map((e) =>
          e.id !== entryId
            ? e
            : {
                ...e,
                sets: e.sets
                  .filter((s) => s.id !== setId)
                  .map((s, i) => ({ ...s, setNumber: i + 1 })),
              },
        ),
      }));
    },
    [mutateActive],
  );

  const addExerciseToSession = useCallback(
    (exerciseId: string) => {
      mutateActive(
        (session, prev) => {
          const index = buildExerciseIndex(prev.customExercises);
          const ex = index.get(exerciseId);
          const rest = ex?.defaultRestSec ?? 60;
          return {
            ...session,
            entries: [
              ...session.entries,
              {
                id: uid('en'),
                exerciseId,
                prescriptionId: null,
                targetReps: 10,
                targetRepsMax: null,
                targetWeight: 0,
                restSec: rest,
                cue: '',
                note: '',
                sets: Array.from({ length: 3 }, (_, i) => ({
                  id: uid('set'),
                  setNumber: i + 1,
                  weight: 0,
                  reps: 10,
                  restPrescribedSec: rest,
                  restActualSec: null,
                  completed: false,
                  completedAt: null,
                  rpe: null,
                  pain: null,
                })),
              },
            ],
          };
        },
        (prev) => {
          const active = prev.sessions.find((s) => s.status === 'active');
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'session',
            entityLabel: active?.name ?? 'Session',
            field: 'exercise added',
            from: null,
            to: index.get(exerciseId)?.name ?? exerciseId,
            sessionId: active?.id ?? null,
          };
        },
      );
    },
    [mutateActive],
  );

  const removeEntry = useCallback(
    (entryId: string) => {
      mutateActive(
        (session) => ({ ...session, entries: session.entries.filter((e) => e.id !== entryId) }),
        (prev) => {
          const active = prev.sessions.find((s) => s.status === 'active');
          const e = active?.entries.find((x) => x.id === entryId);
          if (!e || !active) return null;
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'session',
            entityLabel: active.name,
            field: 'exercise removed',
            from: index.get(e.exerciseId)?.name ?? e.exerciseId,
            to: null,
            sessionId: active.id,
          };
        },
      );
    },
    [mutateActive],
  );

  const swapEntryExercise = useCallback(
    (entryId: string, exerciseId: string) => {
      mutateActive(
        (session, prev) => {
          const index = buildExerciseIndex(prev.customExercises);
          return {
            ...session,
            entries: session.entries.map((e) =>
              e.id !== entryId
                ? e
                : {
                    ...e,
                    exerciseId,
                    restSec: index.get(exerciseId)?.defaultRestSec ?? e.restSec,
                  },
            ),
          };
        },
        (prev) => {
          const active = prev.sessions.find((s) => s.status === 'active');
          const e = active?.entries.find((x) => x.id === entryId);
          if (!e || !active) return null;
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'exercise_swap',
            entityLabel: active.name,
            field: 'exercise',
            from: index.get(e.exerciseId)?.name ?? e.exerciseId,
            to: index.get(exerciseId)?.name ?? exerciseId,
            sessionId: active.id,
          };
        },
      );
    },
    [mutateActive],
  );

  const setEntryNote = useCallback(
    (entryId: string, note: string) => {
      mutateActive((session) => ({
        ...session,
        entries: session.entries.map((e) => (e.id === entryId ? { ...e, note } : e)),
      }));
    },
    [mutateActive],
  );

  const addNote = useCallback<AppContextValue['addNote']>((input) => {
    setState((prev) => {
      const note: Note = {
        id: uid('note'),
        scope: input.scope,
        sessionId: input.sessionId ?? null,
        exerciseId: input.exerciseId ?? null,
        author: prev.role,
        authorName: prev.role === 'trainer' ? prev.trainerName : prev.patientName,
        body: input.body,
        createdAt: new Date().toISOString(),
        trainerOnly: input.trainerOnly ?? false,
      };
      return { ...prev, notes: [...prev.notes, note] };
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
  }, []);

  const updatePrescription = useCallback(
    (dayId: string, prescriptionId: string, patch: Partial<Prescription>, reason?: string) => {
      setState((prev) => {
        const day = prev.program.days.find((d) => d.id === dayId);
        const existing = day?.prescriptions.find((p) => p.id === prescriptionId);
        if (!day || !existing) return prev;

        const index = buildExerciseIndex(prev.customExercises);
        const label = index.get(existing.exerciseId)?.name ?? existing.exerciseId;

        const events: AuditEvent[] = [];
        for (const [key, value] of Object.entries(patch) as Array<
          [keyof Prescription, Prescription[keyof Prescription]]
        >) {
          if (key === 'progression') continue;
          const before = existing[key];
          if (before === value) continue;
          events.push(
            recordAudit(prev, {
              entity: 'prescription',
              entityLabel: label,
              field: String(key),
              from: (before ?? null) as string | number | null,
              to: (value ?? null) as string | number | null,
              reason,
            }),
          );
        }

        return {
          ...prev,
          audit: [...events, ...prev.audit],
          program: {
            ...prev.program,
            days: prev.program.days.map((d) =>
              d.id !== dayId
                ? d
                : {
                    ...d,
                    prescriptions: d.prescriptions.map((p) =>
                      p.id === prescriptionId ? { ...p, ...patch } : p,
                    ),
                  },
            ),
          },
        };
      });
    },
    [recordAudit],
  );

  const addPrescription = useCallback(
    (dayId: string, exerciseId: string) => {
      setState((prev) => {
        const day = prev.program.days.find((d) => d.id === dayId);
        if (!day) return prev;
        const index = buildExerciseIndex(prev.customExercises);
        const ex = index.get(exerciseId);
        const prescription: Prescription = {
          id: uid('rx'),
          exerciseId,
          order: day.prescriptions.length,
          targetSets: 3,
          targetReps: 10,
          targetRepsMax: 12,
          targetWeight: 0,
          restSec: ex?.defaultRestSec ?? 60,
          progression: { type: 'double', increment: 5, gatePainMax: 3, stallLimit: 3 },
          cue: '',
        };
        return {
          ...prev,
          audit: [
            recordAudit(prev, {
              entity: 'program_day',
              entityLabel: day.name,
              field: 'exercise added',
              from: null,
              to: ex?.name ?? exerciseId,
            }),
            ...prev.audit,
          ],
          program: {
            ...prev.program,
            days: prev.program.days.map((d) =>
              d.id === dayId ? { ...d, prescriptions: [...d.prescriptions, prescription] } : d,
            ),
          },
        };
      });
    },
    [recordAudit],
  );

  const removePrescription = useCallback(
    (dayId: string, prescriptionId: string) => {
      setState((prev) => {
        const day = prev.program.days.find((d) => d.id === dayId);
        const existing = day?.prescriptions.find((p) => p.id === prescriptionId);
        if (!day || !existing) return prev;
        const index = buildExerciseIndex(prev.customExercises);
        return {
          ...prev,
          audit: [
            recordAudit(prev, {
              entity: 'program_day',
              entityLabel: day.name,
              field: 'exercise removed',
              from: index.get(existing.exerciseId)?.name ?? existing.exerciseId,
              to: null,
            }),
            ...prev.audit,
          ],
          program: {
            ...prev.program,
            days: prev.program.days.map((d) =>
              d.id !== dayId
                ? d
                : {
                    ...d,
                    prescriptions: d.prescriptions
                      .filter((p) => p.id !== prescriptionId)
                      .map((p, i) => ({ ...p, order: i })),
                  },
            ),
          },
        };
      });
    },
    [recordAudit],
  );

  const applySuggestion = useCallback(
    (dayId: string, suggestion: Suggestion) => {
      updatePrescription(
        dayId,
        suggestion.prescriptionId,
        { [suggestion.field]: suggestion.to } as Partial<Prescription>,
        suggestion.rationale,
      );
    },
    [updatePrescription],
  );

  const addCustomExercise = useCallback((exercise: Exercise) => {
    setState((prev) => ({ ...prev, customExercises: [...prev.customExercises, exercise] }));
  }, []);

  const toggleFavorite = useCallback((exerciseId: string) => {
    setState((prev) => ({
      ...prev,
      favorites: prev.favorites.includes(exerciseId)
        ? prev.favorites.filter((f) => f !== exerciseId)
        : [...prev.favorites, exerciseId],
    }));
  }, []);

  const resetData = useCallback(() => setState(seedState()), []);

  const value: AppContextValue = {
    state,
    exerciseIndex,
    allExercises,
    activeSession,
    lastCompletedSession,
    exerciseName,
    setRole,
    updateSettings,
    startSession,
    endSession,
    discardSession,
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    addExerciseToSession,
    removeEntry,
    swapEntryExercise,
    setEntryNote,
    addNote,
    deleteNote,
    updatePrescription,
    addPrescription,
    removePrescription,
    applySuggestion,
    addCustomExercise,
    toggleFavorite,
    resetData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { useApp } from './context';
