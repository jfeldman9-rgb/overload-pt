import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppState,
  AuditEntity,
  AuditEvent,
  BackupStatus,
  ClientRecord,
  Exercise,
  ExerciseEntry,
  MovementClip,
  Note,
  Prescription,
  Role,
  Session,
  SetLog,
  Settings,
  Suggestion,
  VoiceNote,
} from '../types';
import { buildExerciseIndex, EXERCISES } from '../data/exercises';
import { uid } from '../lib/format';
import { deleteBlob, getBlob, putBlob, readDoc } from '../lib/idb';
import { backup, STATE_DOC } from '../lib/backup';
import { downloadBlob, saveFile } from '../lib/media';
import { createZip, readZip } from '../lib/zip';
import { isConfigured } from '../lib/supabase';
import {
  AppContext,
  canAccessChart,
  type Actor,
  type AppContextValue,
  type NewBodyMetric,
  type NewClip,
  type NewVoiceNote,
  type PreparedBackup,
} from './context';
import { seedState, STATE_VERSION, therapistLabel } from './seed';

const LEGACY_KEY = 'overload-pt.v1';

/* ── Hydration ──────────────────────────────────────────────────────── */

interface LegacyState {
  version: number;
  role: Role;
  patientName: string;
  trainerName: string;
  settings: Omit<Settings, 'lengthUnits' | 'clipMaxSec'>;
  program: ClientRecord['program'];
  sessions: Session[];
  notes: Array<Omit<Note, 'authorId'>>;
  audit: Array<Omit<AuditEvent, 'actorId'>>;
  customExercises: Exercise[];
  favorites: string[];
  recentExercises: string[];
}

/**
 * Carry forward a chart written by the localStorage-only version rather than
 * dropping someone's logged sessions on upgrade.
 */
function migrateLegacy(): AppState | null {
  let legacy: LegacyState | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyState;
    if (parsed?.version !== 1 || !parsed.program) return null;
    legacy = parsed;
  } catch {
    return null;
  }

  const therapistId = 'th_legacy';
  const clientId = 'cl_legacy';
  const base = seedState();

  return {
    ...base,
    therapists: [{ id: therapistId, name: legacy.trainerName || 'Therapist', credential: '' }],
    actingTherapistId: therapistId,
    activeClientId: clientId,
    role: legacy.role ?? 'trainer',
    settings: {
      ...base.settings,
      units: legacy.settings?.units ?? 'lb',
      autoStartRest: legacy.settings?.autoStartRest ?? true,
      restAlerts: legacy.settings?.restAlerts ?? true,
      clinicalFields: legacy.settings?.clinicalFields ?? true,
    },
    customExercises: legacy.customExercises ?? [],
    clients: [
      {
        id: clientId,
        name: legacy.patientName || 'Patient',
        condition: '',
        therapistId,
        sharedTherapistIds: [],
        sharedWithClinic: false,
        program: legacy.program,
        sessions: legacy.sessions ?? [],
        notes: (legacy.notes ?? []).map((n) => ({
          ...n,
          authorId: n.author === 'trainer' ? therapistId : clientId,
        })),
        audit: (legacy.audit ?? []).map((a) => ({
          ...a,
          actorId: a.actor === 'trainer' ? therapistId : clientId,
        })),
        bodyMetrics: [],
        clips: [],
        voiceNotes: [],
        favorites: legacy.favorites ?? [],
        recentExercises: legacy.recentExercises ?? [],
      },
    ],
  };
}

interface LoadedState {
  state: AppState;
  /** False when this chart has never been written to IndexedDB. */
  persisted: boolean;
}

/**
 * A backup arrives from outside the app, so it gets checked before it becomes
 * state. `Array.isArray(clients)` was the only gate, and an empty array is
 * structurally valid but renders to a blank screen with no way back.
 */
function describeBackupProblem(incoming: AppState | undefined): string | null {
  if (!incoming || typeof incoming !== 'object') return 'that file is not an Overload PT backup';
  if (!Array.isArray(incoming.clients)) return 'that file is not an Overload PT backup';
  if (incoming.clients.length === 0) return 'it contains no charts';
  if (!Array.isArray(incoming.therapists)) return 'it has no therapist roster';

  for (const client of incoming.clients) {
    const name = client?.name ?? 'a chart';
    if (!client?.id) return `${name} has no id`;
    if (!client.program || !Array.isArray(client.program.days)) {
      return `${name} has no program days`;
    }
    for (const key of ['sessions', 'notes', 'audit', 'bodyMetrics', 'clips', 'voiceNotes'] as const) {
      if (!Array.isArray(client[key])) return `${name} is missing its ${key}`;
    }
  }
  return null;
}

async function loadState(): Promise<LoadedState> {
  const stored = await readDoc<AppState>(STATE_DOC);
  if (stored && stored.version === STATE_VERSION && Array.isArray(stored.clients)) {
    return { state: stored, persisted: true };
  }
  return { state: migrateLegacy() ?? seedState(), persisted: false };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial, setInitial] = useState<LoadedState | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await backup.start();
      const loaded = await loadState();
      if (alive) setInitial(loaded);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!initial) {
    return (
      <div className="app">
        <div className="content">
          <div className="empty">Opening chart…</div>
        </div>
      </div>
    );
  }

  return (
    <Chart initial={initial.state} persisted={initial.persisted}>
      {children}
    </Chart>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function actorOf(state: AppState): Actor {
  if (state.role === 'trainer') {
    const t =
      state.therapists.find((x) => x.id === state.actingTherapistId) ?? state.therapists[0];
    return { role: 'trainer', id: t?.id ?? 'therapist', name: t ? therapistLabel(t) : 'Therapist' };
  }
  const c = state.clients.find((x) => x.id === state.activeClientId);
  return { role: 'patient', id: c?.id ?? 'client', name: c?.name ?? 'Patient' };
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

function makeAudit(state: AppState, input: AuditInput): AuditEvent {
  const actor = actorOf(state);
  return {
    id: uid('aud'),
    at: new Date().toISOString(),
    actor: actor.role,
    actorId: actor.id,
    actorName: actor.name,
    entity: input.entity,
    entityLabel: input.entityLabel,
    field: input.field,
    from: input.from,
    to: input.to,
    reason: input.reason ?? null,
    sessionId: input.sessionId ?? null,
  };
}

/** Filename-safe scope tag: trailing punctuation must not leave a dangling dash. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return mimeType.startsWith('audio') ? 'm4a' : 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

/* ── Chart provider ─────────────────────────────────────────────────── */

function Chart({
  initial,
  persisted,
  children,
}: {
  initial: AppState;
  persisted: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<AppState>(initial);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(() => ({
    configured: isConfigured(),
    phase: isConfigured() ? 'idle' : 'unconfigured',
    pending: 0,
    lastLocalWriteAt: null,
    lastSyncedAt: null,
    lastError: null,
  }));

  const summaryRef = useRef('Chart created');
  /*
   * A chart loaded from IndexedDB is already durable, so the first render is
   * not a change. A freshly seeded or migrated one is not durable yet, so it
   * gets written and queued immediately — otherwise "IndexedDB is the source
   * of truth" would only become true after the first edit.
   */
  const firstRender = useRef(persisted);

  useEffect(() => backup.subscribe(setBackupStatus), []);

  /**
   * The single place a mutation becomes durable: write locally, then enqueue
   * the remote backup. Running it in an effect keeps the reducer pure.
   */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    backup.recordChange(state, summaryRef.current, state.activeClientId);
  }, [state]);

  const commit = useCallback((summary: string, updater: (prev: AppState) => AppState) => {
    summaryRef.current = summary;
    setState(updater);
  }, []);

  /** Mutate the open chart, optionally appending an attributed audit event. */
  const commitChart = useCallback(
    (
      summary: string,
      fn: (client: ClientRecord, prev: AppState) => ClientRecord,
      audit?: (client: ClientRecord, prev: AppState) => AuditInput | null,
      clientIdOverride?: string,
    ) => {
      commit(summary, (prev) => {
        const targetId = clientIdOverride ?? prev.activeClientId;
        return {
          ...prev,
          clients: prev.clients.map((c) => {
            if (c.id !== targetId) return c;
            const next = fn(c, prev);
            const input = audit?.(c, prev);
            return input ? { ...next, audit: [makeAudit(prev, input), ...next.audit] } : next;
          }),
        };
      });
    },
    [commit],
  );

  /* ── Derived ─────────────────────────────────────────────────────── */

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

  const actingTherapist = useMemo(
    () =>
      state.therapists.find((t) => t.id === state.actingTherapistId) ??
      state.therapists[0] ?? { id: 'th', name: 'Therapist', credential: '' },
    [state.therapists, state.actingTherapistId],
  );

  const actor = useMemo(() => actorOf(state), [state]);

  const client = useMemo(() => {
    const requested =
      state.clients.find((c) => c.id === state.activeClientId) ?? state.clients[0];
    if (state.role !== 'trainer' || !requested) return requested;
    // Never render a chart the acting therapist cannot open, whatever the
    // stored activeClientId says.
    if (canAccessChart(requested, actingTherapist.id)) return requested;
    return state.clients.find((c) => canAccessChart(c, actingTherapist.id)) ?? requested;
  }, [state.clients, state.activeClientId, state.role, actingTherapist.id]);

  const visibleClients = useMemo(() => {
    if (state.role === 'patient') return client ? [client] : [];
    return state.clients.filter((c) => canAccessChart(c, actingTherapist.id));
  }, [state.clients, state.role, actingTherapist.id, client]);

  const lockedClients = useMemo(() => {
    if (state.role === 'patient') return [];
    return state.clients.filter((c) => !canAccessChart(c, actingTherapist.id));
  }, [state.clients, state.role, actingTherapist.id]);

  const isOwningTherapist = client?.therapistId === actingTherapist.id;
  const canEdit =
    state.role === 'patient' ? true : Boolean(client && canAccessChart(client, actingTherapist.id));

  const notes = useMemo(() => {
    if (!client) return [];
    return state.role === 'trainer' ? client.notes : client.notes.filter((n) => !n.trainerOnly);
  }, [client, state.role]);

  const voiceNotes = useMemo(() => {
    if (!client) return [];
    return state.role === 'trainer'
      ? client.voiceNotes
      : client.voiceNotes.filter((v) => !v.trainerOnly);
  }, [client, state.role]);

  const activeSession = useMemo(
    () => client?.sessions.find((s) => s.status === 'active') ?? null,
    [client],
  );

  const lastCompletedSession = useMemo(
    () =>
      [...(client?.sessions ?? [])]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null,
    [client],
  );

  /* ── Clinic actions ──────────────────────────────────────────────── */

  const setRole = useCallback(
    (role: Role) => commit(`Switched to ${role} view`, (s) => ({ ...s, role })),
    [commit],
  );

  const setActingTherapist = useCallback(
    (id: string) =>
      commit('Switched acting therapist', (s) => {
        const stillVisible = s.clients.find(
          (c) => c.id === s.activeClientId && canAccessChart(c, id),
        );
        const fallback = s.clients.find((c) => canAccessChart(c, id));
        return {
          ...s,
          actingTherapistId: id,
          activeClientId: stillVisible?.id ?? fallback?.id ?? s.activeClientId,
        };
      }),
    [commit],
  );

  const setActiveClient = useCallback(
    (id: string) => commit('Opened chart', (s) => ({ ...s, activeClientId: id })),
    [commit],
  );

  const setShareWithClinic = useCallback(
    (clientId: string, shared: boolean, reason?: string) => {
      commitChart(
        shared ? 'Shared chart with clinic' : 'Stopped clinic sharing',
        (c) => ({ ...c, sharedWithClinic: shared }),
        (c) => ({
          entity: 'sharing',
          entityLabel: c.name,
          field: 'shared with clinic',
          from: c.sharedWithClinic ? 'yes' : 'no',
          to: shared ? 'yes' : 'no',
          reason: reason ?? null,
        }),
        clientId,
      );
    },
    [commitChart],
  );

  const setShareWithTherapist = useCallback(
    (clientId: string, therapistId: string, shared: boolean, reason?: string) => {
      commitChart(
        shared ? 'Shared chart with colleague' : 'Revoked colleague access',
        (c) => ({
          ...c,
          sharedTherapistIds: shared
            ? [...new Set([...c.sharedTherapistIds, therapistId])]
            : c.sharedTherapistIds.filter((id) => id !== therapistId),
        }),
        (c, prev) => {
          const t = prev.therapists.find((x) => x.id === therapistId);
          return {
            entity: 'sharing',
            entityLabel: c.name,
            field: shared ? 'access granted' : 'access revoked',
            from: null,
            to: t ? therapistLabel(t) : therapistId,
            reason: reason ?? null,
          };
        },
        clientId,
      );
    },
    [commitChart],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      commit('Updated settings', (s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [commit],
  );

  /* ── Sessions ────────────────────────────────────────────────────── */

  const startSession = useCallback(
    (dayId: string) => {
      const id = uid('ses');
      commitChart('Started a session', (c, prev) => {
        const day = c.program.days.find((d) => d.id === dayId);
        if (!day) return c;
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
        return { ...c, sessions: [...c.sessions, session] };
      });
      return id;
    },
    [commitChart],
  );

  const endSession = useCallback(() => {
    commitChart('Completed a session', (c) => ({
      ...c,
      sessions: c.sessions.map((s) =>
        s.status === 'active'
          ? { ...s, status: 'completed' as const, endedAt: new Date().toISOString() }
          : s,
      ),
    }));
  }, [commitChart]);

  const discardSession = useCallback(() => {
    commitChart('Discarded a session', (c) => ({
      ...c,
      sessions: c.sessions.filter((s) => s.status !== 'active'),
    }));
  }, [commitChart]);

  const mutateActive = useCallback(
    (
      summary: string,
      fn: (session: Session, prev: AppState) => Session,
      audit?: (client: ClientRecord, prev: AppState) => AuditInput | null,
    ) => {
      commitChart(
        summary,
        (c, prev) => {
          const active = c.sessions.find((s) => s.status === 'active');
          if (!active) return c;
          const updated = fn(active, prev);
          return {
            ...c,
            sessions: c.sessions.map((s) => (s.id === active.id ? updated : s)),
          };
        },
        audit,
      );
    },
    [commitChart],
  );

  const updateSet = useCallback(
    (entryId: string, setId: string, patch: Partial<SetLog>) => {
      mutateActive('Logged a set', (session) => ({
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
      mutateActive('Completed a set', (session) => ({
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
        'Added a set',
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
        (c, prev) => {
          const active = c.sessions.find((s) => s.status === 'active');
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
      mutateActive('Removed a set', (session) => ({
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
        'Added an exercise to the session',
        (session, prev) => {
          const index = buildExerciseIndex(prev.customExercises);
          const rest = index.get(exerciseId)?.defaultRestSec ?? 60;
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
        (c, prev) => {
          const active = c.sessions.find((s) => s.status === 'active');
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
        'Removed an exercise from the session',
        (session) => ({
          ...session,
          entries: session.entries.filter((e) => e.id !== entryId),
        }),
        (c, prev) => {
          const active = c.sessions.find((s) => s.status === 'active');
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
        'Swapped an exercise',
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
        (c, prev) => {
          const active = c.sessions.find((s) => s.status === 'active');
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
      mutateActive('Edited an exercise note', (session) => ({
        ...session,
        entries: session.entries.map((e) => (e.id === entryId ? { ...e, note } : e)),
      }));
    },
    [mutateActive],
  );

  /* ── Notes ───────────────────────────────────────────────────────── */

  const addNote = useCallback<AppContextValue['addNote']>(
    (input) => {
      const id = uid('note');
      commitChart('Added a note', (c, prev) => {
        const who = actorOf(prev);
        const note: Note = {
          id,
          scope: input.scope,
          sessionId: input.sessionId ?? null,
          exerciseId: input.exerciseId ?? null,
          author: who.role,
          authorId: who.id,
          authorName: who.name,
          body: input.body,
          createdAt: new Date().toISOString(),
          trainerOnly: input.trainerOnly ?? false,
          voiceNoteId: input.voiceNoteId ?? null,
        };
        return { ...c, notes: [...c.notes, note] };
      });
      return id;
    },
    [commitChart],
  );

  const deleteNote = useCallback(
    (id: string) => {
      commitChart('Deleted a note', (c) => ({ ...c, notes: c.notes.filter((n) => n.id !== id) }));
    },
    [commitChart],
  );

  /* ── Program ─────────────────────────────────────────────────────── */

  const updatePrescription = useCallback(
    (dayId: string, prescriptionId: string, patch: Partial<Prescription>, reason?: string) => {
      commit('Updated a prescription', (prev) => {
        const targetId = prev.activeClientId;
        return {
          ...prev,
          clients: prev.clients.map((c) => {
            if (c.id !== targetId) return c;
            const day = c.program.days.find((d) => d.id === dayId);
            const existing = day?.prescriptions.find((p) => p.id === prescriptionId);
            if (!day || !existing) return c;

            const index = buildExerciseIndex(prev.customExercises);
            const label = index.get(existing.exerciseId)?.name ?? existing.exerciseId;
            const events: AuditEvent[] = [];
            for (const [key, value] of Object.entries(patch) as Array<
              [keyof Prescription, Prescription[keyof Prescription]]
            >) {
              if (key === 'progression') continue;
              if (existing[key] === value) continue;
              events.push(
                makeAudit(prev, {
                  entity: 'prescription',
                  entityLabel: label,
                  field: String(key),
                  from: (existing[key] ?? null) as string | number | null,
                  to: (value ?? null) as string | number | null,
                  reason,
                }),
              );
            }

            return {
              ...c,
              audit: [...events, ...c.audit],
              program: {
                ...c.program,
                days: c.program.days.map((d) =>
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
          }),
        };
      });
    },
    [commit],
  );

  const addPrescription = useCallback(
    (dayId: string, exerciseId: string) => {
      commitChart(
        'Added an exercise to the program',
        (c, prev) => {
          const day = c.program.days.find((d) => d.id === dayId);
          if (!day) return c;
          const index = buildExerciseIndex(prev.customExercises);
          const prescription: Prescription = {
            id: uid('rx'),
            exerciseId,
            order: day.prescriptions.length,
            targetSets: 3,
            targetReps: 10,
            targetRepsMax: 12,
            targetWeight: 0,
            restSec: index.get(exerciseId)?.defaultRestSec ?? 60,
            progression: { type: 'double', increment: 5, gatePainMax: 3, stallLimit: 3 },
            cue: '',
          };
          return {
            ...c,
            program: {
              ...c.program,
              days: c.program.days.map((d) =>
                d.id === dayId ? { ...d, prescriptions: [...d.prescriptions, prescription] } : d,
              ),
            },
          };
        },
        (c, prev) => {
          const day = c.program.days.find((d) => d.id === dayId);
          if (!day) return null;
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'program_day',
            entityLabel: day.name,
            field: 'exercise added',
            from: null,
            to: index.get(exerciseId)?.name ?? exerciseId,
          };
        },
      );
    },
    [commitChart],
  );

  const removePrescription = useCallback(
    (dayId: string, prescriptionId: string) => {
      commitChart(
        'Removed an exercise from the program',
        (c) => ({
          ...c,
          program: {
            ...c.program,
            days: c.program.days.map((d) =>
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
        }),
        (c, prev) => {
          const day = c.program.days.find((d) => d.id === dayId);
          const existing = day?.prescriptions.find((p) => p.id === prescriptionId);
          if (!day || !existing) return null;
          const index = buildExerciseIndex(prev.customExercises);
          return {
            entity: 'program_day',
            entityLabel: day.name,
            field: 'exercise removed',
            from: index.get(existing.exerciseId)?.name ?? existing.exerciseId,
            to: null,
          };
        },
      );
    },
    [commitChart],
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

  /* ── Body metrics ────────────────────────────────────────────────── */

  const addBodyMetric = useCallback(
    (input: NewBodyMetric) => {
      commitChart(
        'Logged body metrics',
        (c, prev) => {
          const who = actorOf(prev);
          return {
            ...c,
            bodyMetrics: [
              ...c.bodyMetrics,
              {
                id: uid('bm'),
                clientId: c.id,
                at: input.at,
                bodyweight: input.bodyweight,
                bodyFatPct: input.bodyFatPct,
                waist: input.waist,
                hip: input.hip,
                thigh: input.thigh,
                arm: input.arm,
                restingHr: input.restingHr,
                vo2max: input.vo2max,
                calipers: input.calipers,
                dexa: input.dexa,
                note: input.note,
                units: prev.settings.units,
                lengthUnits: prev.settings.lengthUnits,
                loggedBy: who.role,
                loggedById: who.id,
                loggedByName: who.name,
              },
            ],
          };
        },
        (c) => ({
          entity: 'body_metric',
          entityLabel: c.name,
          field: 'measurements logged',
          from: null,
          to: new Date(input.at).toLocaleDateString(),
        }),
      );
    },
    [commitChart],
  );

  const deleteBodyMetric = useCallback(
    (id: string) => {
      commitChart('Deleted a body metric entry', (c) => ({
        ...c,
        bodyMetrics: c.bodyMetrics.filter((m) => m.id !== id),
      }));
    },
    [commitChart],
  );

  /* ── Media ───────────────────────────────────────────────────────── */

  const addClip = useCallback(
    async (input: NewClip, blob: Blob) => {
      const blobKey = uid('clip');
      await putBlob(blobKey, blob);
      const clientId = state.activeClientId;
      const exerciseLabel = exerciseName(input.exerciseId);

      commitChart(
        `Saved a movement clip — ${exerciseLabel}`,
        (c, prev) => {
          const who = actorOf(prev);
          const clip: MovementClip = {
            id: uid('mc'),
            clientId: c.id,
            exerciseId: input.exerciseId,
            sessionId: input.sessionId,
            setId: input.setId,
            recordedAt: new Date().toISOString(),
            durationSec: input.durationSec,
            mimeType: input.mimeType,
            byteSize: blob.size,
            blobKey,
            posterUrl: input.posterUrl,
            label: input.label,
            note: input.note,
            recordedBy: who.role,
            recordedById: who.id,
            recordedByName: who.name,
            backup: 'local',
          };
          return { ...c, clips: [...c.clips, clip] };
        },
        () => ({
          entity: 'clip',
          entityLabel: exerciseLabel,
          field: 'movement clip recorded',
          from: null,
          to: `${Math.round(input.durationSec)}s`,
        }),
      );

      backup.recordMedia('clip', blobKey, `Movement clip — ${exerciseLabel}`, clientId);
    },
    [commitChart, exerciseName, state.activeClientId],
  );

  const deleteClip = useCallback(
    async (id: string) => {
      const clip = client?.clips.find((c) => c.id === id);
      if (clip?.blobKey) await deleteBlob(clip.blobKey);
      commitChart('Deleted a movement clip', (c) => ({
        ...c,
        clips: c.clips.filter((x) => x.id !== id),
      }));
    },
    [client, commitChart],
  );

  const setClipNote = useCallback(
    (id: string, note: string) => {
      commitChart('Edited a clip note', (c) => ({
        ...c,
        clips: c.clips.map((x) => (x.id === id ? { ...x, note } : x)),
      }));
    },
    [commitChart],
  );

  const addVoiceNote = useCallback(
    async (input: NewVoiceNote, blob: Blob | null) => {
      const blobKey = blob ? uid('voice') : null;
      if (blob && blobKey) await putBlob(blobKey, blob);
      const clientId = state.activeClientId;
      const voiceId = uid('vn');
      const noteId = uid('note');

      commitChart(
        'Saved a dictated session note',
        (c, prev) => {
          const who = actorOf(prev);
          const voice: VoiceNote = {
            id: voiceId,
            clientId: c.id,
            sessionId: input.sessionId,
            exerciseId: input.exerciseId,
            at: new Date().toISOString(),
            durationSec: input.durationSec,
            transcript: input.transcript,
            cleaned: input.cleaned,
            blobKey,
            mimeType: input.mimeType,
            transcriptionSupported: input.transcriptionSupported,
            authorRole: who.role,
            authorId: who.id,
            authorName: who.name,
            trainerOnly: input.trainerOnly,
            noteId,
            backup: 'local',
          };
          const note: Note = {
            id: noteId,
            scope: input.exerciseId ? 'exercise' : 'session',
            sessionId: input.sessionId,
            exerciseId: input.exerciseId,
            author: who.role,
            authorId: who.id,
            authorName: who.name,
            body: input.cleaned || input.transcript,
            createdAt: new Date().toISOString(),
            trainerOnly: input.trainerOnly,
            voiceNoteId: voiceId,
          };
          return { ...c, voiceNotes: [...c.voiceNotes, voice], notes: [...c.notes, note] };
        },
        (c) => ({
          entity: 'voice_note',
          entityLabel: c.name,
          field: 'voice note recorded',
          from: null,
          to: `${Math.round(input.durationSec)}s`,
          sessionId: input.sessionId,
        }),
      );

      if (blobKey) backup.recordMedia('voice', blobKey, 'Voice note audio', clientId);
    },
    [commitChart, state.activeClientId],
  );

  const deleteVoiceNote = useCallback(
    async (id: string) => {
      const voice = client?.voiceNotes.find((v) => v.id === id);
      if (voice?.blobKey) await deleteBlob(voice.blobKey);
      commitChart('Deleted a voice note', (c) => ({
        ...c,
        voiceNotes: c.voiceNotes.filter((v) => v.id !== id),
        notes: c.notes.filter((n) => n.voiceNoteId !== id),
      }));
    },
    [client, commitChart],
  );

  /* ── Library ─────────────────────────────────────────────────────── */

  const addCustomExercise = useCallback(
    (exercise: Exercise) =>
      commit('Added a custom exercise', (s) => ({
        ...s,
        customExercises: [...s.customExercises, exercise],
      })),
    [commit],
  );

  const toggleFavorite = useCallback(
    (exerciseId: string) => {
      commitChart('Toggled a favorite', (c) => ({
        ...c,
        favorites: c.favorites.includes(exerciseId)
          ? c.favorites.filter((f) => f !== exerciseId)
          : [...c.favorites, exerciseId],
      }));
    },
    [commitChart],
  );

  const resetData = useCallback(() => commit('Reset to demo data', () => seedState()), [commit]);

  /* ── Backup surface ──────────────────────────────────────────────── */

  const retryBackup = useCallback(() => backup.retry(), []);

  /** Charts the current view is allowed to take off the device. */
  const exportableClients = useMemo(
    () => (state.role === 'patient' ? state.clients.filter((c) => c.id === client.id) : state.clients),
    [state.role, state.clients, client.id],
  );

  const exportChartJson = useCallback(() => {
    const payload = {
      app: 'overload-pt',
      version: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      state: { ...state, clients: exportableClients },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const scope = state.role === 'patient' ? slugify(client.name) : 'clinic';
    downloadBlob(blob, `overload-pt-${scope}-${new Date().toISOString().slice(0, 10)}.json`);
  }, [state, exportableClients, client.name]);

  /** Every media blob key the current scope is allowed to take with it. */
  const mediaManifest = useCallback(
    () =>
      exportableClients.flatMap((c) => [
        ...c.clips.flatMap((x) => (x.blobKey ? [{ key: x.blobKey, mimeType: x.mimeType }] : [])),
        ...c.voiceNotes.flatMap((x) =>
          x.blobKey ? [{ key: x.blobKey, mimeType: x.mimeType }] : [],
        ),
      ]),
    [exportableClients],
  );

  /**
   * One file, so a backup can leave an iPhone: Safari allows a single download
   * per tap, and the previous export looped over every clip after an await,
   * which loses the activation the download needs.
   */
  const prepareBackup = useCallback(async (): Promise<PreparedBackup> => {
    const chart = {
      app: 'overload-pt',
      version: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      state: { ...state, clients: exportableClients },
    };
    const entries = [
      {
        name: 'chart.json',
        data: new TextEncoder().encode(JSON.stringify(chart, null, 2)),
      },
    ];

    let missingMedia = 0;
    for (const item of mediaManifest()) {
      const blob = await getBlob(item.key);
      if (!blob) {
        missingMedia += 1;
        continue;
      }
      entries.push({
        name: `media/${item.key}.${extensionFor(item.mimeType)}`,
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }

    const blob = createZip(entries);
    const scope = state.role === 'patient' ? slugify(client.name) : 'clinic';
    return {
      blob,
      filename: `overload-pt-${scope}-${new Date().toISOString().slice(0, 10)}.zip`,
      chartCount: exportableClients.length,
      mediaCount: entries.length - 1,
      missingMedia,
      byteSize: blob.size,
    };
  }, [state, exportableClients, client.name, mediaManifest]);

  const saveBackup = useCallback(
    (prepared: PreparedBackup) => saveFile(prepared.blob, prepared.filename),
    [],
  );

  const importBackupFile = useCallback(
    async (file: File) => {
      if (state.role !== 'trainer') {
        throw new Error('Importing a backup replaces every chart, so it is a therapist action.');
      }

      const isZip =
        file.type === 'application/zip' || /\.zip$/i.test(file.name);
      let chartText: string;
      let restoredMedia = 0;

      if (isZip) {
        const entries = readZip(await file.arrayBuffer());
        const chart = entries.find((e) => e.name === 'chart.json');
        if (!chart) {
          throw new Error('That archive has no chart.json — it is not an Overload PT backup.');
        }
        chartText = new TextDecoder().decode(chart.data);
        for (const entry of entries) {
          if (!entry.name.startsWith('media/')) continue;
          const key = entry.name.slice('media/'.length).split('.')[0];
          if (!key) continue;
          await putBlob(key, new Blob([entry.data.slice()]));
          restoredMedia += 1;
        }
      } else {
        chartText = await file.text();
      }

      const parsed = JSON.parse(chartText) as { state?: AppState; version?: number };
      const incoming = parsed.state ?? (parsed as unknown as AppState);
      const problem = describeBackupProblem(incoming);
      if (problem) throw new Error(`Not importing — ${problem}.`);
      if (incoming.version !== STATE_VERSION) {
        throw new Error(
          `Backup is version ${incoming.version ?? '?'}; this app reads version ${STATE_VERSION}.`,
        );
      }

      commit('Imported a backup', (prev) => {
        // Restore the data, not the exporting device's view. A therapist who
        // imports a client's backup should not silently land in patient view,
        // and the chart that opens has to be one that exists and that they
        // are allowed to open.
        const acting =
          incoming.therapists.find((t) => t.id === prev.actingTherapistId) ??
          incoming.therapists[0];
        const openable = incoming.clients.filter((c) =>
          acting ? canAccessChart(c, acting.id) : true,
        );
        const active =
          openable.find((c) => c.id === prev.activeClientId) ??
          openable[0] ??
          incoming.clients[0];
        return {
          ...incoming,
          role: prev.role,
          actingTherapistId: acting?.id ?? incoming.actingTherapistId,
          activeClientId: active.id,
        };
      });

      const clips = incoming.clients.reduce((n, c) => n + c.clips.length, 0);
      const media = isZip
        ? `${restoredMedia} media file${restoredMedia === 1 ? '' : 's'} restored`
        : 'no media in a JSON-only backup';
      return `${incoming.clients.length} charts, ${clips} clip records, ${media}.`;
    },
    [commit, state.role],
  );

  const importMediaFiles = useCallback(async (files: FileList) => {
    let count = 0;
    for (const file of Array.from(files)) {
      const key = file.name.split('.')[0];
      if (!key) continue;
      await putBlob(key, file);
      count += 1;
    }
    return count;
  }, []);

  const value: AppContextValue = {
    hydrated: true,
    state,
    exerciseIndex,
    allExercises,
    exerciseName,

    therapists: state.therapists,
    actingTherapist,
    actor,
    visibleClients,
    lockedClients,
    client,
    isOwningTherapist,
    canEdit,
    setActingTherapist,
    setActiveClient,
    setShareWithClinic,
    setShareWithTherapist,

    exportableClients,
    program: client.program,
    sessions: client.sessions,
    notes,
    audit: client.audit,
    bodyMetrics: client.bodyMetrics,
    clips: client.clips,
    voiceNotes,
    activeSession,
    lastCompletedSession,

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
    addBodyMetric,
    deleteBodyMetric,
    addClip,
    deleteClip,
    setClipNote,
    addVoiceNote,
    deleteVoiceNote,
    addCustomExercise,
    toggleFavorite,
    resetData,

    backupStatus,
    retryBackup,
    exportChartJson,
    prepareBackup,
    saveBackup,
    importBackupFile,
    importMediaFiles,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { useApp } from './context';
