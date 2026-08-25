import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { EXERCISES } from '../data/exercises';
import { therapistLabel } from '../store/seed';
import { storageKind } from '../lib/idb';
import { backupLabel } from '../lib/backup';

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
  const {
    state,
    updateSettings,
    resetData,
    allExercises,
    therapists,
    client,
    visibleClients,
    lockedClients,
    backupStatus,
    exportChartJson,
    exportMediaFiles,
  } = useApp();
  const [message, setMessage] = useState('');

  const mediaCount = state.clients.reduce(
    (n, c) =>
      n +
      c.clips.filter((x) => x.blobKey).length +
      c.voiceNotes.filter((x) => x.blobKey).length,
    0,
  );

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
          {(['in', 'cm'] as const).map((u) => (
            <button
              key={u}
              className="chip grow"
              style={{ justifyContent: 'center' }}
              aria-pressed={state.settings.lengthUnits === u}
              onClick={() => updateSettings({ lengthUnits: u })}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="tiny faint" style={{ marginTop: 8 }}>
          Weight and girth units. Changing them relabels inputs; it does not convert values already
          logged.
        </div>
      </div>

      <div className="section-label">Movement clips</div>
      <div className="card">
        <div className="row">
          {[15, 20, 25, 30].map((sec) => (
            <button
              key={sec}
              className="chip grow"
              style={{ justifyContent: 'center' }}
              aria-pressed={state.settings.clipMaxSec === sec}
              onClick={() => updateSettings({ clipMaxSec: sec })}
            >
              {sec}s
            </button>
          ))}
        </div>
        <div className="tiny faint" style={{ marginTop: 8 }}>
          Hard cap on a recorded clip. Short clips stay comparable and fit in a backup.
        </div>
      </div>

      <div className="section-label">Clinic</div>
      <div className="card">
        <div className="row between">
          <span className="small muted">Clinic</span>
          <strong className="small">{state.clinicName}</strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Therapists</span>
          <strong className="small">{therapists.map(therapistLabel).join(' · ')}</strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Charts you can open</span>
          <strong className="small">
            {visibleClients.length}
            {lockedClients.length > 0 ? ` (${lockedClients.length} locked)` : ''}
          </strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Open chart</span>
          <strong className="small">{client.name}</strong>
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
        <div className="row between">
          <span className="small muted">Backup status</span>
          <strong className="small">{backupLabel(backupStatus)}</strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Local store</span>
          <strong className="small">
            {storageKind() === 'indexeddb' ? 'IndexedDB' : 'Fallback (localStorage)'}
          </strong>
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">Recorded media on device</span>
          <strong className="small">{mediaCount}</strong>
        </div>
        <div className="small muted" style={{ margin: '10px 0' }}>
          IndexedDB is the source of truth, including video and audio. Every change is written here
          first and then queued for the cloud, so the app works with no signal in the clinic.
        </div>
        <button className="btn block" onClick={exportChartJson}>
          Export all charts (JSON)
        </button>
        <button
          className="btn block"
          style={{ marginTop: 8 }}
          onClick={() =>
            void exportMediaFiles().then((n) =>
              setMessage(n ? `Downloaded ${n} media file(s).` : 'No recorded media on this device.'),
            )
          }
        >
          Export video + audio files
        </button>
        <button
          className="btn block danger"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm('Reset to demo data? All logged sessions, notes, and metrics will be lost.')) {
              resetData();
            }
          }}
        >
          Reset to demo data
        </button>
        {message && <div className="notice">{message}</div>}
        <div className="tiny faint" style={{ marginTop: 10 }}>
          Reset clears chart data. Recorded video and audio blobs stay in IndexedDB until you delete
          the clip that owns them.
        </div>
      </div>
    </>
  );
}
