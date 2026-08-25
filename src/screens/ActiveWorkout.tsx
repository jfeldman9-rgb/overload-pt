import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/AppContext';
import { useRestTimer } from '../hooks/useRestTimer';
import { SetGrid } from '../components/SetGrid';
import { RestTimerDock } from '../components/RestTimerDock';
import { ExercisePicker } from '../components/ExercisePicker';
import { Sheet } from '../components/Sheet';
import { MovementSheet } from '../components/MovementSheet';
import { VoiceNoteSheet } from '../components/VoiceNoteSheet';
import { durationBetween, mmss, shortDate, weight } from '../lib/format';
import { averageRest, completedSets, entryVolume, lastPerformance } from '../lib/overload';
import { clipsForExercise } from '../lib/review';
import type { Tab } from '../App';
import type { ExerciseEntry } from '../types';

/** Label a new clip with the set it belongs to, so the list reads by itself. */
function clipLabelFor(entry: ExerciseEntry, units: string): string {
  const done = completedSets(entry);
  const last = done[done.length - 1] ?? entry.sets[0];
  if (!last) return 'Movement clip';
  return `Set ${last.setNumber} — ${last.weight ? `${last.weight} ${units} × ` : ''}${last.reps}`;
}

/** The set the athlete is on: first unlogged set, scanning exercises in order. */
function firstIncompleteSet(entries: ExerciseEntry[]) {
  for (const entry of entries) {
    const set = entry.sets.find((s) => !s.completed);
    if (set) return { entry, set };
  }
  return null;
}

interface ActiveWorkoutProps {
  onNavigate: (tab: Tab) => void;
  /** Slot in the sticky bottom stack that the rest timer renders into. */
  dockSlot: HTMLElement | null;
}

export function ActiveWorkout({ onNavigate, dockSlot }: ActiveWorkoutProps) {
  const {
    state,
    activeSession,
    sessions,
    clips,
    voiceNotes,
    actor,
    exerciseIndex,
    exerciseName,
    updateSet,
    toggleSetComplete,
    addSet,
    removeSet,
    addExerciseToSession,
    removeEntry,
    swapEntryExercise,
    setEntryNote,
    addNote,
    endSession,
    discardSession,
  } = useApp();

  const timer = useRestTimer(state.settings.restAlerts);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<ExerciseEntry | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [videoTarget, setVideoTarget] = useState<ExerciseEntry | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceExerciseId, setVoiceExerciseId] = useState<string | null>(null);

  /** Set that the currently running rest belongs to, so rest lands on the right row. */
  const pendingRestSetId = useRef<{ entryId: string; setId: string } | null>(null);

  if (!activeSession) {
    return (
      <div className="empty">
        No workout in progress.
        <div style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={() => onNavigate('home')}>
            Pick a session
          </button>
        </div>
      </div>
    );
  }

  const session = activeSession;
  const current = firstIncompleteSet(session.entries);

  const sessionVoiceCount = voiceNotes.filter((v) => v.sessionId === session.id).length;

  const totalSets = session.entries.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = session.entries.reduce((n, e) => n + completedSets(e).length, 0);

  /** Close out the running rest by writing the measured gap onto its set. */
  const flushRest = () => {
    const actual = timer.skip();
    const pending = pendingRestSetId.current;
    if (actual != null && pending) {
      updateSet(pending.entryId, pending.setId, { restActualSec: actual });
    }
    pendingRestSetId.current = null;
    return actual;
  };

  const handleToggleSet = (entry: ExerciseEntry, setId: string) => {
    const set = entry.sets.find((s) => s.id === setId);
    if (!set) return;

    if (!set.completed) {
      flushRest();
      toggleSetComplete(entry.id, setId, null);
      navigator.vibrate?.(14);

      const hasMoreInEntry = entry.sets.some((s) => s.id !== setId && !s.completed);
      const nextEntry = session.entries.find(
        (e) => e.id !== entry.id && e.sets.some((s) => !s.completed),
      );
      const nextLabel = hasMoreInEntry
        ? `${exerciseName(entry.exerciseId)} · set ${set.setNumber + 1}`
        : nextEntry
          ? exerciseName(nextEntry.exerciseId)
          : '';

      if (state.settings.autoStartRest && (hasMoreInEntry || nextEntry)) {
        pendingRestSetId.current = { entryId: entry.id, setId };
        timer.start(entry.restSec || 60, nextLabel);
      }
    } else {
      toggleSetComplete(entry.id, setId, null);
    }
  };

  const finish = () => {
    timer.reset();
    const body = sessionNote.trim();
    if (body) {
      addNote({ body, scope: 'session', sessionId: session.id, trainerOnly: false });
    }
    endSession();
    setFinishOpen(false);
    onNavigate('history');
  };

  const nextLabel = current
    ? `Next: ${exerciseName(current.entry.exerciseId)} · set ${current.set.setNumber}`
    : 'All sets logged';

  return (
    <>
      <div className="card">
        <div className="row between">
          <div className="grow">
            <strong>{session.name}</strong>
            <div className="small muted">
              {durationBetween(session.startedAt, null)} elapsed · {doneSets}/{totalSets} sets ·{' '}
              {Math.round(session.entries.reduce((n, e) => n + entryVolume(e), 0)).toLocaleString()}{' '}
              {state.settings.units}
            </div>
          </div>
          <button className="btn sm ghost" onClick={() => setFinishOpen(true)}>
            Finish
          </button>
        </div>
        {/* Full size on purpose: mid-session both hands are busy and this is
            the control a therapist reaches for while the patient is talking. */}
        <button
          className="mic-button"
          style={{ marginTop: 12 }}
          onClick={() => {
            setVoiceExerciseId(null);
            setVoiceOpen(true);
          }}
        >
          <span className="mic-glyph" aria-hidden="true">
            🎙
          </span>
          <span>Dictate a session note</span>
          {sessionVoiceCount > 0 && (
            <span className="pill">
              {sessionVoiceCount} saved
            </span>
          )}
        </button>
      </div>

      {session.entries.map((entry) => {
        const exercise = exerciseIndex.get(entry.exerciseId);
        const prior = lastPerformance(sessions, entry.exerciseId, session.id);
        const isActive = current?.entry.id === entry.id;
        const avg = averageRest(entry);
        const clipCount = clipsForExercise(clips, entry.exerciseId).length;

        return (
          <div key={entry.id} className={`exercise${isActive ? ' active' : ''}`}>
            <div className="exercise-head">
              <div className="exercise-title">
                <h3>{exercise?.name ?? entry.exerciseId}</h3>
                {isActive && <span className="pill accent">Now</span>}
              </div>
              <div className="exercise-target">
                Target {entry.targetReps}
                {entry.targetRepsMax ? `–${entry.targetRepsMax}` : ''} reps ·{' '}
                {entry.targetWeight ? weight(entry.targetWeight, state.settings.units) : 'bodyweight'}{' '}
                · rest {mmss(entry.restSec)}
                {avg != null && <> · avg actual {mmss(avg)}</>}
              </div>
              {entry.cue && <div className="exercise-cue">{entry.cue}</div>}
            </div>

            <div className="exercise-body">
              <SetGrid
                entry={entry}
                exercise={exercise}
                settings={state.settings}
                currentSetId={isActive ? current?.set.id ?? null : null}
                onUpdateSet={(setId, patch) => updateSet(entry.id, setId, patch)}
                onToggleSet={(setId) => handleToggleSet(entry, setId)}
                onRemoveSet={(setId) => removeSet(entry.id, setId)}
              />

              {prior && (
                <div className="lastperf">
                  <b>Last time</b> ({shortDate(prior.session.startedAt)}):{' '}
                  {completedSets(prior.entry)
                    .map((s) => `${s.weight || 'BW'}×${s.reps}`)
                    .join(', ')}
                  {' · '}
                  {Math.round(entryVolume(prior.entry)).toLocaleString()} {state.settings.units}{' '}
                  volume
                  {prior.entry.note && (
                    <div style={{ marginTop: 4 }} className="tiny faint">
                      “{prior.entry.note}”
                    </div>
                  )}
                </div>
              )}

              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={() => addSet(entry.id)}>
                  + Set
                </button>
                <button
                  className="btn sm"
                  onClick={() => setVideoTarget(entry)}
                  aria-label={`Movement video for ${exercise?.name ?? entry.exerciseId}`}
                >
                  🎥 Video{clipCount ? ` (${clipCount})` : ''}
                </button>
                <button className="btn sm" onClick={() => setNoteTarget(entry)}>
                  {entry.note ? '📝 Note ✓' : '📝 Note'}
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    setVoiceExerciseId(entry.exerciseId);
                    setVoiceOpen(true);
                  }}
                  aria-label={`Dictate a note for ${exercise?.name ?? entry.exerciseId}`}
                >
                  🎙 Dictate
                </button>
                <button className="btn sm" onClick={() => setSwapTarget(entry.id)}>
                  ⇄ Swap
                </button>
                <button className="btn sm danger" onClick={() => removeEntry(entry.id)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <button className="btn block" onClick={() => setPickerOpen(true)}>
        + Add exercise to this session
      </button>

      <button
        className="btn block danger"
        style={{ marginTop: 10 }}
        onClick={() => {
          if (confirm('Discard this workout? Logged sets will be lost.')) {
            timer.reset();
            discardSession();
            onNavigate('home');
          }
        }}
      >
        Discard workout
      </button>

      {dockSlot &&
        createPortal(
          <RestTimerDock
            timer={timer}
            nextLabel={nextLabel}
            canStart={Boolean(current)}
            onStart={() => {
              const target = current;
              if (!target) return;
              pendingRestSetId.current = null;
              timer.start(target.entry.restSec || 60, nextLabel);
            }}
            onSkip={flushRest}
            onFinish={() => setFinishOpen(true)}
          />,
          dockSlot,
        )}

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => addExerciseToSession(id)}
      />

      <ExercisePicker
        open={swapTarget !== null}
        title="Swap exercise"
        onClose={() => setSwapTarget(null)}
        onPick={(id) => {
          if (swapTarget) swapEntryExercise(swapTarget, id);
          setSwapTarget(null);
        }}
      />

      <Sheet
        open={noteTarget !== null}
        title={noteTarget ? `Note — ${exerciseName(noteTarget.exerciseId)}` : 'Note'}
        onClose={() => setNoteTarget(null)}
      >
        <textarea
          autoFocus
          value={noteTarget ? session.entries.find((e) => e.id === noteTarget.id)?.note ?? '' : ''}
          onChange={(e) => noteTarget && setEntryNote(noteTarget.id, e.target.value)}
          placeholder="Form, pain, ROM, equipment setting — anything worth seeing next time."
        />
        <div className="tiny faint" style={{ marginTop: 8 }}>
          Exercise notes surface automatically under “Last time” in the next session.
        </div>
      </Sheet>

      {videoTarget && (
        <MovementSheet
          open
          onClose={() => setVideoTarget(null)}
          exerciseId={videoTarget.exerciseId}
          sessionId={session.id}
          defaultLabel={clipLabelFor(videoTarget, state.settings.units)}
        />
      )}

      <VoiceNoteSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        sessionId={session.id}
        exerciseId={voiceExerciseId}
        title={
          voiceExerciseId ? `Dictate — ${exerciseName(voiceExerciseId)}` : 'Dictate a session note'
        }
      />

      <Sheet open={finishOpen} title="Finish workout" onClose={() => setFinishOpen(false)}>
        <div className="stats" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="value">{doneSets}</div>
            <div className="label">Sets done</div>
          </div>
          <div className="stat">
            <div className="value">
              {Math.round(session.entries.reduce((n, e) => n + entryVolume(e), 0)).toLocaleString()}
            </div>
            <div className="label">Volume</div>
          </div>
          <div className="stat">
            <div className="value">{durationBetween(session.startedAt, null)}</div>
            <div className="label">Duration</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="finish-note">
            Session note ({actor.name})
          </label>
          <textarea
            id="finish-note"
            value={sessionNote}
            onChange={(e) => setSessionNote(e.target.value)}
            placeholder={
              state.role === 'trainer'
                ? 'What changed today, what to progress next, any limits to carry forward.'
                : 'How the session felt, pain, anything your PT should know.'
            }
          />
        </div>

        <div className="tiny faint" style={{ margin: '8px 0 14px' }}>
          This note becomes the pinned “last workout” note on the home screen and is added to the
          running ledger.
        </div>

        <button className="btn primary block" onClick={finish}>
          Save and finish
        </button>
      </Sheet>
    </>
  );
}
