import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { ExercisePicker } from '../components/ExercisePicker';
import { Sheet } from '../components/Sheet';
import { NumberField } from '../components/NumberField';
import { mmss } from '../lib/format';
import { suggestProgression } from '../lib/overload';
import type { Prescription, ProgressionType } from '../types';

const PROGRESSION_LABELS: Record<ProgressionType, string> = {
  double: 'Double progression (reps then load)',
  linear: 'Linear (add load each success)',
  reps: 'Reps only',
  none: 'Hold — no auto-progression',
};

export function ProgramScreen() {
  const {
    state,
    program,
    sessions,
    canEdit,
    exerciseName,
    updatePrescription,
    addPrescription,
    removePrescription,
    applySuggestion,
  } = useApp();

  const [dayId, setDayId] = useState(program.days[0]?.id ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Prescription | null>(null);
  const [reason, setReason] = useState('');

  const day = program.days.find((d) => d.id === dayId) ?? program.days[0];

  const lastSessionForDay = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'completed' && s.programDayId === day?.id)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null,
    [sessions, day?.id],
  );

  const suggestions = useMemo(() => {
    if (!day) return new Map<string, ReturnType<typeof suggestProgression>>();
    const map = new Map<string, ReturnType<typeof suggestProgression>>();
    for (const p of day.prescriptions) {
      map.set(p.id, suggestProgression(p, sessions, lastSessionForDay));
    }
    return map;
  }, [day, sessions, lastSessionForDay]);

  if (!day) return <div className="empty">No program days yet.</div>;

  const isTrainer = state.role === 'trainer' && canEdit;

  const commit = (patch: Partial<Prescription>) => {
    if (!editing) return;
    updatePrescription(day.id, editing.id, patch, reason.trim() || undefined);
    setEditing({ ...editing, ...patch });
  };

  return (
    <>
      <div className="picker-filters">
        {program.days.map((d) => (
          <button key={d.id} className="chip" aria-pressed={d.id === day.id} onClick={() => setDayId(d.id)}>
            {d.name.split('—')[0].trim()}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row between">
          <div className="grow">
            <strong>{day.name}</strong>
            <div className="small muted">
              {day.prescriptions.length} exercises ·{' '}
              {day.prescriptions.reduce((n, p) => n + p.targetSets, 0)} prescribed sets
            </div>
          </div>
        </div>
        {!isTrainer && (
          <div className="tiny faint" style={{ marginTop: 8 }}>
            You're viewing as the patient. Switch to the trainer role to edit prescriptions.
          </div>
        )}
      </div>

      {day.prescriptions.map((p) => {
        const suggestion = suggestions.get(p.id);
        return (
          <div key={p.id} className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <strong>{exerciseName(p.exerciseId)}</strong>
                <div className="small muted" style={{ marginTop: 2 }}>
                  {p.targetSets} × {p.targetReps}
                  {p.targetRepsMax ? `–${p.targetRepsMax}` : ''} ·{' '}
                  {p.targetWeight ? `${p.targetWeight} ${state.settings.units}` : 'bodyweight'} ·
                  rest {mmss(p.restSec)}
                </div>
                <div className="tiny faint" style={{ marginTop: 3 }}>
                  {PROGRESSION_LABELS[p.progression.type]}
                  {p.progression.gatePainMax != null &&
                    ` · pain gate ≤ ${p.progression.gatePainMax}/10`}
                </div>
                {p.cue && <div className="exercise-cue">{p.cue}</div>}
              </div>
              {isTrainer && (
                <button
                  className="btn sm"
                  onClick={() => {
                    setEditing(p);
                    setReason('');
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {suggestion && (
              <div
                className={`suggestion${suggestion.kind === 'deload' ? ' deload' : ''}${
                  suggestion.kind === 'hold' ? ' hold' : ''
                }`}
                style={{ marginTop: 10 }}
              >
                <div className="row between">
                  <span className="tiny" style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                    {suggestion.kind === 'deload'
                      ? 'DELOAD SUGGESTED'
                      : suggestion.kind === 'hold'
                        ? 'HOLD SUGGESTED'
                        : 'PROGRESSION SUGGESTED'}
                  </span>
                  <span className="delta small">
                    <span className="from">{suggestion.from}</span> →{' '}
                    <span className="to">{suggestion.to}</span>
                  </span>
                </div>
                <div className="tiny faint" style={{ margin: '4px 0 9px' }}>
                  {suggestion.rationale}
                </div>
                {isTrainer && suggestion.kind !== 'hold' && (
                  <button
                    className="btn sm primary block"
                    onClick={() => applySuggestion(day.id, suggestion)}
                  >
                    Approve — updates prescription and logs the change
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isTrainer && (
        <button className="btn block" onClick={() => setPickerOpen(true)}>
          + Add exercise to {day.name.split('—')[0].trim()}
        </button>
      )}

      <ExercisePicker
        open={pickerOpen}
        title={`Add to ${day.name}`}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => addPrescription(day.id, id)}
      />

      <Sheet
        open={editing !== null}
        title={editing ? exerciseName(editing.exerciseId) : 'Edit'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="stack">
            <div className="fieldgrid three">
              <div className="field">
                <label>Sets</label>
                <NumberField
                  value={editing.targetSets}
                  step={1}
                  min={1}
                  ariaLabel="Target sets"
                  onChange={(v) => commit({ targetSets: v })}
                />
              </div>
              <div className="field">
                <label>Reps</label>
                <NumberField
                  value={editing.targetReps}
                  step={1}
                  min={1}
                  ariaLabel="Target reps"
                  onChange={(v) => commit({ targetReps: v })}
                />
              </div>
              <div className="field">
                <label>Reps max</label>
                <NumberField
                  value={editing.targetRepsMax ?? 0}
                  step={1}
                  ariaLabel="Rep range top"
                  onChange={(v) => commit({ targetRepsMax: v || null })}
                />
              </div>
            </div>

            <div className="fieldgrid">
              <div className="field">
                <label>Weight ({state.settings.units})</label>
                <NumberField
                  value={editing.targetWeight}
                  step={state.settings.units === 'kg' ? 2.5 : 5}
                  decimals
                  ariaLabel="Target weight"
                  onChange={(v) => commit({ targetWeight: v })}
                />
              </div>
              <div className="field">
                <label>Rest (seconds)</label>
                <NumberField
                  value={editing.restSec}
                  step={15}
                  min={0}
                  ariaLabel="Rest seconds"
                  onChange={(v) => commit({ restSec: v })}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="prog-type">Progression rule</label>
              <select
                id="prog-type"
                value={editing.progression.type}
                onChange={(e) =>
                  commit({
                    progression: {
                      ...editing.progression,
                      type: e.target.value as ProgressionType,
                    },
                  })
                }
              >
                {(Object.keys(PROGRESSION_LABELS) as ProgressionType[]).map((t) => (
                  <option key={t} value={t}>
                    {PROGRESSION_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="fieldgrid">
              <div className="field">
                <label>Increment ({state.settings.units})</label>
                <NumberField
                  value={editing.progression.increment}
                  step={2.5}
                  decimals
                  ariaLabel="Progression increment"
                  onChange={(v) =>
                    commit({ progression: { ...editing.progression, increment: v } })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="pain-gate">Pain gate (max)</label>
                <select
                  id="pain-gate"
                  value={editing.progression.gatePainMax ?? ''}
                  onChange={(e) =>
                    commit({
                      progression: {
                        ...editing.progression,
                        gatePainMax: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value="">No gate</option>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>
                      ≤ {i}/10
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="cue">Coaching cue</label>
              <input
                id="cue"
                value={editing.cue}
                onChange={(e) => commit({ cue: e.target.value })}
                placeholder="Shown to the patient above the set grid"
              />
            </div>

            <div className="field">
              <label htmlFor="reason">Reason for change (recorded in the log)</label>
              <input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Cleared to progress — pain steady at 2/10"
              />
            </div>

            <button
              className="btn danger block"
              onClick={() => {
                removePrescription(day.id, editing.id);
                setEditing(null);
              }}
            >
              Remove from program
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
