import { useApp } from '../store/AppContext';
import { EXERCISES } from '../data/exercises';

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle">
      <div className="grow">
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{label}</div>
        <div className="tiny faint">{hint}</div>
      </div>
      <button
        className={`switch${value ? ' on' : ''}`}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const { state, updateSettings, resetData, allExercises } = useApp();

  return (
    <>
      <div className="section-label">Session</div>
      <div className="card">
        <Toggle
          label="Auto-start rest timer"
          hint="Start the prescribed countdown the moment a set is checked off."
          value={state.settings.autoStartRest}
          onChange={(v) => updateSettings({ autoStartRest: v })}
        />
        <Toggle
          label="Rest alerts"
          hint="Vibration, chime, and a notification when rest is up."
          value={state.settings.restAlerts}
          onChange={(v) => updateSettings({ restAlerts: v })}
        />
        <Toggle
          label="Clinical fields"
          hint="Show pain and RPE inputs under each exercise."
          value={state.settings.clinicalFields}
          onChange={(v) => updateSettings({ clinicalFields: v })}
        />
      </div>

      <div className="section-label">Units</div>
      <div className="card">
        <div className="row">
          {(['lb', 'kg'] as const).map((u) => (
            <button
              key={u}
              className="chip grow"
              style={{ justifyContent: 'center' }}
              aria-pressed={state.settings.units === u}
              onClick={() => updateSettings({ units: u })}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="tiny faint" style={{ marginTop: 8 }}>
          Changing units relabels inputs; it does not convert previously logged values.
        </div>
      </div>

      <div className="section-label">Library</div>
      <div className="card">
        <div className="row between">
          <span className="small muted">Built-in exercises</span>
          <strong>{EXERCISES.length}</strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Custom exercises</span>
          <strong>{state.customExercises.length}</strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Searchable total</span>
          <strong>{allExercises.length}</strong>
        </div>
      </div>

      <div className="section-label">Data</div>
      <div className="card">
        <div className="small muted" style={{ marginBottom: 10 }}>
          Everything is stored locally on this device, so the app keeps working with no signal in
          the clinic or gym.
        </div>
        <button
          className="btn block"
          onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `overload-pt-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export all data (JSON)
        </button>
        <button
          className="btn block danger"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm('Reset to demo data? All logged sessions and notes will be lost.')) {
              resetData();
            }
          }}
        >
          Reset to demo data
        </button>
      </div>
    </>
  );
}
