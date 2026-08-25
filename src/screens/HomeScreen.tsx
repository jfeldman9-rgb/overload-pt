import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { NotesLedger, PinnedNote } from '../components/NotesLedger';
import { ChangeLog } from '../components/ChangeLog';
import { Sheet } from '../components/Sheet';
import { durationBetween, longDate, relativeDay, weight } from '../lib/format';
import { sessionVolume, summarizeSession, suggestProgression } from '../lib/overload';
import type { Tab } from '../App';

export function HomeScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const {
    state,
    activeSession,
    lastCompletedSession,
    startSession,
    addNote,
    exerciseName,
  } = useApp();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const isTrainer = state.role === 'trainer';

  const sessionNameFor = (id: string | null) =>
    state.sessions.find((s) => s.id === id)?.name ?? 'Session';

  const lastNote = useMemo(() => {
    const visible = state.notes.filter((n) => isTrainer || !n.trainerOnly);
    return (
      [...visible]
        .filter((n) => n.author === 'trainer')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null
    );
  }, [state.notes, isTrainer]);

  const visibleNotes = useMemo(
    () => state.notes.filter((n) => isTrainer || !n.trainerOnly),
    [state.notes, isTrainer],
  );

  const summary = lastCompletedSession
    ? summarizeSession(lastCompletedSession, state.sessions)
    : null;

  // Everything the trainer would otherwise have to derive by hand before the session.
  const pendingSuggestions = useMemo(() => {
    return state.program.days.flatMap((day) =>
      day.prescriptions
        .map((p) => {
          const last = [...state.sessions]
            .filter((s) => s.status === 'completed' && s.programDayId === day.id)
            .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
          const suggestion = suggestProgression(p, state.sessions, last ?? null);
          return suggestion ? { day, suggestion } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    );
  }, [state.program.days, state.sessions]);

  const completed = state.sessions.filter((s) => s.status === 'completed');

  const submitNote = () => {
    const body = noteDraft.trim();
    if (!body) return;
    addNote({
      body,
      scope: 'session',
      sessionId: lastCompletedSession?.id ?? null,
      trainerOnly: false,
    });
    setNoteDraft('');
  };

  return (
    <>
      {activeSession && (
        <div className="card" style={{ borderColor: 'rgba(88,166,255,0.45)' }}>
          <div className="row between">
            <div>
              <div className="tiny faint">In progress</div>
              <strong>{activeSession.name}</strong>
              <div className="small muted">
                Started {durationBetween(activeSession.startedAt, null)} ago
              </div>
            </div>
            <button className="btn primary" onClick={() => onNavigate('workout')}>
              Resume
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <div className="grow">
            <div className="tiny faint">{isTrainer ? 'Patient' : 'Physical therapist'}</div>
            <h2 style={{ margin: '2px 0 0', fontSize: 19 }}>
              {isTrainer ? state.patientName : state.trainerName}
            </h2>
            <div className="small muted">
              {completed.length} sessions logged ·{' '}
              {lastCompletedSession
                ? `last ${relativeDay(lastCompletedSession.startedAt)}`
                : 'no sessions yet'}
            </div>
          </div>
        </div>
      </div>

      {lastNote && (
        <>
          <div className="section-label">Note from last workout</div>
          <PinnedNote note={lastNote} sessionName={sessionNameFor(lastNote.sessionId)} />
          <button
            className="btn block ghost"
            style={{ marginTop: 10 }}
            onClick={() => setLedgerOpen(true)}
          >
            📜 Open full notes ledger ({visibleNotes.length})
          </button>
        </>
      )}

      {lastCompletedSession && summary && (
        <>
          <div className="section-label">Last session</div>
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <div>
                <strong>{lastCompletedSession.name}</strong>
                <div className="small muted">
                  {longDate(lastCompletedSession.startedAt)} ·{' '}
                  {durationBetween(lastCompletedSession.startedAt, lastCompletedSession.endedAt)}
                </div>
              </div>
              {summary.prCount > 0 && <span className="pill accent">{summary.prCount} PR</span>}
            </div>
            <div className="stats">
              <div className="stat">
                <div className="value">{Math.round(summary.volume).toLocaleString()}</div>
                <div className="label">Volume {state.settings.units}</div>
              </div>
              <div className="stat">
                <div className="value">{summary.sets}</div>
                <div className="label">Sets</div>
              </div>
              <div className="stat">
                <div className="value">{summary.reps}</div>
                <div className="label">Reps</div>
              </div>
            </div>
            {summary.volumeDelta != null && (
              <div className="small muted" style={{ marginTop: 9 }}>
                {summary.volumeDelta >= 0 ? '▲' : '▼'}{' '}
                {weight(Math.abs(summary.volumeDelta), state.settings.units)} volume vs the previous{' '}
                {lastCompletedSession.name.split('—')[0].trim().toLowerCase()} day
              </div>
            )}
          </div>
        </>
      )}

      {isTrainer && pendingSuggestions.length > 0 && (
        <>
          <div className="section-label">Progression suggestions</div>
          <div className="card">
            <div className="small muted" style={{ marginBottom: 10 }}>
              Based on the last logged session. Nothing changes until you approve it in the program
              editor.
            </div>
            <div className="stack">
              {pendingSuggestions.slice(0, 4).map(({ day, suggestion }) => (
                <div
                  key={suggestion.id}
                  className={`suggestion${suggestion.kind === 'deload' ? ' deload' : ''}${
                    suggestion.kind === 'hold' ? ' hold' : ''
                  }`}
                >
                  <div className="row between">
                    <strong className="small">{exerciseName(suggestion.exerciseId)}</strong>
                    <span className="tiny faint">{day.name.split('—')[0].trim()}</span>
                  </div>
                  <div className="small" style={{ marginTop: 3 }}>
                    <span className="delta">
                      <span className="from">{suggestion.from}</span> →{' '}
                      <span className="to">{suggestion.to}</span>
                    </span>{' '}
                    <span className="muted">
                      {suggestion.field === 'targetWeight' ? state.settings.units : 'reps'}
                    </span>
                  </div>
                  <div className="tiny faint" style={{ marginTop: 3 }}>
                    {suggestion.rationale}
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('program')}
            >
              Review in program editor
            </button>
          </div>
        </>
      )}

      <div className="section-label">Start a session</div>
      <div className="stack">
        {state.program.days.map((day) => (
          <button
            key={day.id}
            className="card"
            style={{ textAlign: 'left', marginBottom: 0, width: '100%' }}
            onClick={() => {
              if (activeSession) {
                onNavigate('workout');
                return;
              }
              startSession(day.id);
              onNavigate('workout');
            }}
          >
            <div className="row between">
              <div className="grow">
                <strong>{day.name}</strong>
                <div className="small muted">
                  {day.prescriptions.length} exercises ·{' '}
                  {day.prescriptions.reduce((n, p) => n + p.targetSets, 0)} sets
                </div>
                <div className="tiny faint" style={{ marginTop: 4 }}>
                  {day.prescriptions
                    .slice(0, 3)
                    .map((p) => exerciseName(p.exerciseId))
                    .join(' · ')}
                  {day.prescriptions.length > 3 ? ' …' : ''}
                </div>
              </div>
              <span className="btn sm primary">Start</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-label">Add a note</div>
      <div className="card">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder={
            isTrainer
              ? 'Clinical note for the next session — findings, limits, what to progress…'
              : 'How did it feel? Any pain, stiffness, or wins to flag for your PT?'
          }
        />
        <button
          className="btn primary block"
          style={{ marginTop: 10 }}
          onClick={submitNote}
          disabled={!noteDraft.trim()}
        >
          Save note as {isTrainer ? state.trainerName : state.patientName}
        </button>
      </div>

      {state.audit.length > 0 && (
        <>
          <div className="section-label">Recent changes</div>
          <div className="card">
            <ChangeLog events={state.audit} limit={5} />
            <button
              className="btn block ghost"
              style={{ marginTop: 10 }}
              onClick={() => onNavigate('history')}
            >
              View all {state.audit.length} changes
            </button>
          </div>
        </>
      )}

      <Sheet open={ledgerOpen} title="Notes ledger" onClose={() => setLedgerOpen(false)}>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Every note from every session, newest first. Volume to date:{' '}
          {Math.round(completed.reduce((n, s) => n + sessionVolume(s), 0)).toLocaleString()}{' '}
          {state.settings.units}.
        </div>
        <NotesLedger notes={visibleNotes} sessionNameFor={sessionNameFor} />
      </Sheet>
    </>
  );
}
