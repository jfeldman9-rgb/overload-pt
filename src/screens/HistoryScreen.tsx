import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { ChangeLog } from '../components/ChangeLog';
import { NotesLedger } from '../components/NotesLedger';
import { Sparkline } from '../components/Sparkline';
import { Sheet } from '../components/Sheet';
import { durationBetween, longDate, weight } from '../lib/format';
import {
  completedSets,
  entryVolume,
  exerciseHistory,
  sessionVolume,
  summarizeSession,
} from '../lib/overload';
import type { Session } from '../types';

type View = 'sessions' | 'progress' | 'changes' | 'notes';

export function HistoryScreen() {
  const { state, exerciseName } = useApp();
  const [view, setView] = useState<View>('sessions');
  const [detail, setDetail] = useState<Session | null>(null);

  const completed = useMemo(
    () =>
      [...state.sessions]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [state.sessions],
  );

  const trackedExercises = useMemo(() => {
    const ids = new Set<string>();
    for (const s of completed) for (const e of s.entries) ids.add(e.exerciseId);
    return [...ids]
      .map((id) => ({ id, points: exerciseHistory(completed, id) }))
      .filter((x) => x.points.length >= 1)
      .sort((a, b) => b.points.length - a.points.length);
  }, [completed]);

  const sessionNameFor = (id: string | null) =>
    state.sessions.find((s) => s.id === id)?.name ?? 'Session';

  return (
    <>
      <div className="picker-filters">
        {(['sessions', 'progress', 'changes', 'notes'] as View[]).map((v) => (
          <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'sessions'
              ? 'Sessions'
              : v === 'progress'
                ? 'Overload'
                : v === 'changes'
                  ? `Changes (${state.audit.length})`
                  : 'Notes'}
          </button>
        ))}
      </div>

      {view === 'sessions' &&
        (completed.length === 0 ? (
          <div className="empty">No completed sessions yet.</div>
        ) : (
          completed.map((s) => {
            const summary = summarizeSession(s, completed);
            return (
              <button
                key={s.id}
                className="card"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setDetail(s)}
              >
                <div className="row between">
                  <div className="grow">
                    <strong>{s.name}</strong>
                    <div className="small muted">
                      {longDate(s.startedAt)} · {durationBetween(s.startedAt, s.endedAt)}
                    </div>
                  </div>
                  {summary.prCount > 0 && <span className="pill accent">{summary.prCount} PR</span>}
                </div>
                <div className="stats" style={{ marginTop: 10 }}>
                  <div className="stat">
                    <div className="value">{Math.round(summary.volume).toLocaleString()}</div>
                    <div className="label">Volume</div>
                  </div>
                  <div className="stat">
                    <div className="value">{summary.sets}</div>
                    <div className="label">Sets</div>
                  </div>
                  <div className="stat">
                    <div className="value">
                      {summary.volumeDelta == null
                        ? '—'
                        : `${summary.volumeDelta >= 0 ? '+' : ''}${Math.round(summary.volumeDelta)}`}
                    </div>
                    <div className="label">Δ Volume</div>
                  </div>
                </div>
              </button>
            );
          })
        ))}

      {view === 'progress' &&
        (trackedExercises.length === 0 ? (
          <div className="empty">Log a session to start tracking overload.</div>
        ) : (
          trackedExercises.map(({ id, points }) => {
            const first = points[0];
            const last = points[points.length - 1];
            const volumeChange = first.volume ? ((last.volume - first.volume) / first.volume) * 100 : 0;
            return (
              <div key={id} className="card">
                <div className="row between">
                  <strong>{exerciseName(id)}</strong>
                  <span className="tiny faint">{points.length} sessions</span>
                </div>
                <div className="stats" style={{ marginTop: 10 }}>
                  <div className="stat">
                    <div className="value">{last.topWeight || 'BW'}</div>
                    <div className="label">Top {state.settings.units}</div>
                  </div>
                  <div className="stat">
                    <div className="value">{Math.round(last.volume).toLocaleString()}</div>
                    <div className="label">Volume</div>
                  </div>
                  <div className="stat">
                    <div className="value">{last.e1rm || '—'}</div>
                    <div className="label">Est. 1RM</div>
                  </div>
                </div>
                <Sparkline
                  values={points.map((p) => p.volume || p.totalReps)}
                  ariaLabel={`${exerciseName(id)} volume trend`}
                />
                {points.length > 1 && (
                  <div className="tiny faint" style={{ marginTop: 6 }}>
                    {volumeChange >= 0 ? '▲' : '▼'} {Math.abs(Math.round(volumeChange))}% session
                    volume since {longDate(first.date)}
                  </div>
                )}
              </div>
            );
          })
        ))}

      {view === 'changes' && (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Every prescription edit, exercise swap, and set adjustment — who made it, when, and why.
          </div>
          <ChangeLog events={state.audit} />
        </div>
      )}

      {view === 'notes' && (
        <div className="card">
          <NotesLedger
            notes={state.notes.filter((n) => state.role === 'trainer' || !n.trainerOnly)}
            sessionNameFor={sessionNameFor}
          />
        </div>
      )}

      <Sheet open={detail !== null} title={detail?.name ?? ''} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <div className="small muted" style={{ marginBottom: 12 }}>
              {longDate(detail.startedAt)} · {durationBetween(detail.startedAt, detail.endedAt)} ·{' '}
              {weight(sessionVolume(detail), state.settings.units)} total volume
            </div>

            {detail.entries.map((entry) => (
              <div key={entry.id} className="card">
                <strong className="small">{exerciseName(entry.exerciseId)}</strong>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {completedSets(entry)
                    .map((s) => `${s.weight || 'BW'}×${s.reps}`)
                    .join('  ·  ') || 'No sets logged'}
                </div>
                <div className="tiny faint" style={{ marginTop: 4 }}>
                  {Math.round(entryVolume(entry)).toLocaleString()} {state.settings.units} ·{' '}
                  {completedSets(entry).length} sets
                </div>
                {entry.note && (
                  <div className="lastperf" style={{ marginTop: 8 }}>
                    {entry.note}
                  </div>
                )}
              </div>
            ))}

            <div className="section-label">Notes from this session</div>
            <NotesLedger
              notes={state.notes.filter((n) => n.sessionId === detail.id)}
              emptyText="No notes attached to this session."
            />
          </>
        )}
      </Sheet>
    </>
  );
}
