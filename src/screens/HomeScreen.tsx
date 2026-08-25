import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { NotesLedger, PinnedNote } from '../components/NotesLedger';
import { ChangeLog } from '../components/ChangeLog';
import { Sheet } from '../components/Sheet';
import { MovementSheet } from '../components/MovementSheet';
import { VoiceNoteSheet } from '../components/VoiceNoteSheet';
import { BodyMetricSheet } from '../components/BodyMetricSheet';
import { BigTile } from '../components/BigTile';
import { durationBetween, longDate, mmss, relativeDay, weight } from '../lib/format';
import { sessionVolume, suggestProgression } from '../lib/overload';
import {
  bodySnapshot,
  clipRecency,
  lastVisitReview,
  recentChanges,
  redFlags,
  restComplianceLabel,
} from '../lib/review';
import type { Tab } from '../App';

interface HomeScreenProps {
  onNavigate: (tab: Tab) => void;
  onOpenRoster: () => void;
}

export function HomeScreen({ onNavigate, onOpenRoster }: HomeScreenProps) {
  const {
    state,
    client,
    notes,
    voiceNotes,
    audit,
    sessions,
    program,
    activeSession,
    lastCompletedSession,
    startSession,
    addNote,
    exerciseName,
    exerciseIndex,
    therapists,
    isOwningTherapist,
  } = useApp();

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [videoFor, setVideoFor] = useState<string | null>(null);
  const isTrainer = state.role === 'trainer';

  const sessionNameFor = (id: string | null) =>
    sessions.find((s) => s.id === id)?.name ?? 'Session';

  const lastNote = useMemo(
    () =>
      [...notes]
        .filter((n) => n.author === 'trainer')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null,
    [notes],
  );

  const visit = useMemo(() => lastVisitReview(client, notes), [client, notes]);
  const flags = useMemo(() => redFlags(client, exerciseIndex, notes), [client, exerciseIndex, notes]);
  const snapshot = useMemo(() => bodySnapshot(client), [client]);
  const recency = useMemo(() => clipRecency(client, exerciseIndex), [client, exerciseIndex]);
  const handoff = useMemo(() => recentChanges(client), [client]);

  const pendingSuggestions = useMemo(
    () =>
      program.days.flatMap((day) =>
        day.prescriptions
          .map((p) => {
            const last = [...sessions]
              .filter((s) => s.status === 'completed' && s.programDayId === day.id)
              .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
            const suggestion = suggestProgression(p, sessions, last ?? null);
            return suggestion ? { day, suggestion } : null;
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
      ),
    [program.days, sessions],
  );

  const completed = sessions.filter((s) => s.status === 'completed');
  const owner = therapists.find((t) => t.id === client.therapistId);

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
              {isTrainer ? client.name : owner ? owner.name : '—'}
            </h2>
            <div className="small muted">{client.condition}</div>
            <div className="tiny faint" style={{ marginTop: 3 }}>
              {completed.length} sessions ·{' '}
              {lastCompletedSession
                ? `last ${relativeDay(lastCompletedSession.startedAt)}`
                : 'no sessions yet'}
              {isTrainer &&
                (isOwningTherapist ? ' · your patient' : ` · shared from ${owner?.name ?? 'colleague'}`)}
            </div>
          </div>
          {isTrainer && (
            <button className="btn sm" onClick={onOpenRoster}>
              Roster
            </button>
          )}
        </div>
      </div>

      {isTrainer && visit && (
        <>
          <div className="section-label">Red flags</div>
          <div className="card flags">
            {flags.length === 0 ? (
              <div className="flag clear">
                <span className="flag-dot" aria-hidden="true" />
                <div className="grow">
                  <strong className="small">Nothing to act on</strong>
                  <div className="tiny faint">
                    Pain not rising, attendance on cadence, no stalled lifts, no new pain or ROM
                    note.
                  </div>
                </div>
              </div>
            ) : (
              flags.map((flag) => (
                <div key={flag.id} className={`flag ${flag.severity}`}>
                  <span className="flag-dot" aria-hidden="true" />
                  <div className="grow">
                    <strong className="small">{flag.label}</strong>
                    <div className="tiny faint">{flag.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {visit && (
        <>
          <div className="section-label">Last visit</div>
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="grow">
                <strong>{visit.session.name}</strong>
                <div className="small muted">
                  {longDate(visit.session.startedAt)} ({relativeDay(visit.session.startedAt)}) ·{' '}
                  {durationBetween(visit.session.startedAt, visit.session.endedAt)}
                </div>
              </div>
              {visit.prCount > 0 && <span className="pill accent">{visit.prCount} PR</span>}
            </div>

            <div className="stats">
              <div className="stat">
                <div className="value">{Math.round(visit.volume).toLocaleString()}</div>
                <div className="label">Volume {state.settings.units}</div>
              </div>
              <div className="stat">
                <div className="value">{visit.sets}</div>
                <div className="label">Sets</div>
              </div>
              <div className="stat">
                <div className="value">
                  {visit.pain == null ? '—' : `${visit.pain}/10`}
                  {visit.painDelta != null && visit.painDelta !== 0 && (
                    <span className={`pain-delta ${visit.painDelta > 0 ? 'bad' : 'good'}`}>
                      {visit.painDelta > 0 ? '▲' : '▼'}
                      {Math.abs(visit.painDelta)}
                    </span>
                  )}
                </div>
                <div className="label">Peak pain</div>
              </div>
            </div>

            <div className="small muted" style={{ marginTop: 9 }}>
              {visit.volumeDelta != null && (
                <>
                  {visit.volumeDelta >= 0 ? '▲' : '▼'}{' '}
                  {weight(Math.abs(visit.volumeDelta), state.settings.units)} volume vs the previous{' '}
                  {visit.session.name.split('—')[0].trim().toLowerCase()} day ·{' '}
                </>
              )}
              rest {restComplianceLabel(visit.rest)}
              {visit.rest ? ` (${mmss(visit.rest.actualSec)} vs ${mmss(visit.rest.prescribedSec)})` : ''}
            </div>

            {visit.headline && <div className="lastperf" style={{ marginTop: 8 }}>{visit.headline}</div>}
          </div>
        </>
      )}

      <div className="section-label">{isTrainer ? "Today's plan" : 'Your next session'}</div>
      <div className="stack">
        {program.days.map((day) => (
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

      {isTrainer && pendingSuggestions.length > 0 && (
        <>
          <div className="section-label">Pending progressions ({pendingSuggestions.length})</div>
          <div className="card">
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

      <div className="section-label">Objective</div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <strong className="small">Body</strong>
          <span className="tiny faint">
            {snapshot ? `measured ${relativeDay(snapshot.at)}` : 'no measurements yet'}
          </span>
        </div>
        {snapshot && snapshot.lines.length > 0 ? (
          <div className="stats">
            {snapshot.lines.map((line) => (
              <BigTile
                key={line.label}
                label={line.label}
                value={line.value}
                delta={line.delta}
                deltaTone={line.tone}
              />
            ))}
          </div>
        ) : (
          <div className="tiny faint">Log a waist and body fat to start the trend.</div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm grow" onClick={() => setMetricOpen(true)}>
            + Log measurements
          </button>
          <button className="btn sm grow ghost" onClick={() => onNavigate('body')}>
            Body history
          </button>
        </div>

        <div className="row between" style={{ margin: '16px 0 8px' }}>
          <strong className="small">Movement video</strong>
          <span className="tiny faint">
            {recency.filter((r) => !r.stale).length}/{recency.length} lifts current
          </span>
        </div>
        {recency.length === 0 ? (
          <div className="tiny faint">No prescribed lifts to film yet.</div>
        ) : (
          <div className="recency">
            {recency.map((row) => (
              <button
                key={row.exerciseId}
                className={`recency-row${row.stale ? ' stale' : ''}`}
                onClick={() => setVideoFor(row.exerciseId)}
              >
                <span className="grow small">{row.name}</span>
                <span className="tiny">
                  {row.lastAt == null
                    ? 'no clip'
                    : `${row.daysAgo}d ago · ${row.clipCount} clip${row.clipCount === 1 ? '' : 's'}`}
                </span>
                <span className="tiny faint" aria-hidden="true">
                  {row.stale ? '⏺' : '✓'}
                </span>
              </button>
            ))}
          </div>
        )}
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
            📜 Open full notes ledger ({notes.length})
          </button>
        </>
      )}

      {isTrainer && handoff.length > 0 && (
        <>
          <div className="section-label">Handoff — who changed what</div>
          <div className="card">
            <ChangeLog events={handoff} />
            <button
              className="btn block ghost"
              style={{ marginTop: 10 }}
              onClick={() => onNavigate('history')}
            >
              View all {audit.length} changes
            </button>
          </div>
        </>
      )}

      <div className="section-label">Add a note</div>
      <div className="card">
        <button className="mic-button compact" onClick={() => setVoiceOpen(true)}>
          <span className="mic-glyph" aria-hidden="true">
            🎙
          </span>
          <span>Dictate a note</span>
        </button>
        <textarea
          style={{ marginTop: 10 }}
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
          Save note
        </button>
      </div>

      <Sheet open={ledgerOpen} title="Notes ledger" onClose={() => setLedgerOpen(false)}>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Every note from every session, newest first. Volume to date:{' '}
          {Math.round(completed.reduce((n, s) => n + sessionVolume(s), 0)).toLocaleString()}{' '}
          {state.settings.units}.
        </div>
        <NotesLedger notes={notes} sessionNameFor={sessionNameFor} voiceNotes={voiceNotes} />
      </Sheet>

      <VoiceNoteSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        sessionId={lastCompletedSession?.id ?? null}
        title="Dictate a note"
      />

      <BodyMetricSheet open={metricOpen} onClose={() => setMetricOpen(false)} />

      {videoFor && (
        <MovementSheet
          open
          onClose={() => setVideoFor(null)}
          exerciseId={videoFor}
          sessionId={null}
          defaultLabel={exerciseName(videoFor)}
        />
      )}
    </>
  );
}
