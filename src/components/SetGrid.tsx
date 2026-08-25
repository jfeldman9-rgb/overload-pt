import type { Exercise, ExerciseEntry, SetLog, Settings } from '../types';
import { mmss } from '../lib/format';
import { NumberField } from './NumberField';

interface SetGridProps {
  entry: ExerciseEntry;
  exercise: Exercise | undefined;
  settings: Settings;
  currentSetId: string | null;
  onUpdateSet: (setId: string, patch: Partial<SetLog>) => void;
  onToggleSet: (setId: string) => void;
  onRemoveSet: (setId: string) => void;
}

function loadLabel(metric: Exercise['metric'], units: string): string {
  if (metric === 'time' || metric === 'reps') return 'Load';
  if (metric === 'distance_time') return 'Incline';
  return units;
}

function countLabel(metric: Exercise['metric']): string {
  if (metric === 'time' || metric === 'time_weight') return 'Secs';
  if (metric === 'distance_time') return 'Mins';
  return 'Reps';
}

function restDelta(set: SetLog): { text: string; className: string } {
  if (set.restActualSec == null) {
    return { text: set.restPrescribedSec ? `${set.restPrescribedSec}s` : '—', className: '' };
  }
  const over = set.restActualSec - set.restPrescribedSec;
  const className = Math.abs(over) <= 10 ? 'actual' : over > 0 ? 'actual over' : 'actual under';
  return { text: mmss(set.restActualSec), className };
}

export function SetGrid({
  entry,
  exercise,
  settings,
  currentSetId,
  onUpdateSet,
  onToggleSet,
  onRemoveSet,
}: SetGridProps) {
  const metric = exercise?.metric ?? 'weight_reps';
  const weightStep = settings.units === 'kg' ? 2.5 : 5;

  return (
    <div className="setgrid">
      <div className="setgrid-head" role="row">
        <span>Set</span>
        <span>{loadLabel(metric, settings.units)}</span>
        <span>{countLabel(metric)}</span>
        <span>Rest</span>
        <span>Done</span>
      </div>

      {entry.sets.map((set) => {
        const rest = restDelta(set);
        const isCurrent = set.id === currentSetId;
        return (
          <div
            key={set.id}
            className={`setrow${set.completed ? ' done' : ''}${isCurrent ? ' current' : ''}`}
          >
            <div
              className="setnum"
              onDoubleClick={() => entry.sets.length > 1 && onRemoveSet(set.id)}
              title="Double-tap to remove this set"
            >
              {set.setNumber}
            </div>

            <NumberField
              value={set.weight}
              step={weightStep}
              decimals
              ariaLabel={`Set ${set.setNumber} weight`}
              onChange={(v) => onUpdateSet(set.id, { weight: v })}
            />

            <NumberField
              value={set.reps}
              step={metric === 'time' || metric === 'time_weight' ? 5 : 1}
              ariaLabel={`Set ${set.setNumber} ${countLabel(metric).toLowerCase()}`}
              onChange={(v) => onUpdateSet(set.id, { reps: v })}
            />

            <div className="restcell">
              <span className={rest.className}>{rest.text}</span>
            </div>

            <div className="checkcell">
              <button
                className={`checkbtn${set.completed ? ' on' : ''}`}
                aria-label={`Mark set ${set.setNumber} ${set.completed ? 'incomplete' : 'complete'}`}
                aria-pressed={set.completed}
                onClick={() => onToggleSet(set.id)}
              >
                ✓
              </button>
            </div>
          </div>
        );
      })}

      {settings.clinicalFields && (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="tiny faint">Clinical — logged against the last completed set</div>
          <div className="fieldgrid">
            <ClinicalInput
              label="Pain (0–10)"
              max={10}
              entry={entry}
              field="pain"
              onUpdateSet={onUpdateSet}
            />
            <ClinicalInput
              label="RPE (0–10)"
              max={10}
              entry={entry}
              field="rpe"
              onUpdateSet={onUpdateSet}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ClinicalInputProps {
  label: string;
  max: number;
  entry: ExerciseEntry;
  field: 'pain' | 'rpe';
  onUpdateSet: (setId: string, patch: Partial<SetLog>) => void;
}

function ClinicalInput({ label, max, entry, field, onUpdateSet }: ClinicalInputProps) {
  const target = [...entry.sets].reverse().find((s) => s.completed) ?? entry.sets[0];
  const value = target?.[field];

  return (
    <div className="field">
      <label htmlFor={`${entry.id}-${field}`}>{label}</label>
      <select
        id={`${entry.id}-${field}`}
        value={value ?? ''}
        onChange={(e) =>
          target &&
          onUpdateSet(target.id, {
            [field]: e.target.value === '' ? null : Number(e.target.value),
          } as Partial<SetLog>)
        }
      >
        <option value="">—</option>
        {Array.from({ length: max + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </div>
  );
}
