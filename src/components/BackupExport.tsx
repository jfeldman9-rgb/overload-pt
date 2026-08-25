import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { canShareFiles, formatBytes } from '../lib/media';
import type { PreparedBackup } from '../store/context';

/**
 * Getting a backup off the device.
 *
 * Deliberately two taps. Building the bundle has to read media out of
 * IndexedDB, and any `await` spends the transient activation that both
 * `navigator.share()` and a programmatic download require — which is why the
 * previous one-tap media export could never work on an iPhone. Preparing
 * first also means the size and contents are on screen before anything
 * leaves.
 */
export function BackupExport({ compact = false }: { compact?: boolean }) {
  const { state, exportableClients, exportChartJson, prepareBackup, saveBackup } = useApp();
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const isTrainer = state.role === 'trainer';
  const shareable = canShareFiles();

  const prepare = async () => {
    setBusy(true);
    setMessage('');
    try {
      setPrepared(await prepareBackup());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not build the backup file.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!prepared) return;
    const outcome = await saveBackup(prepared);
    if (outcome === 'cancelled') {
      setMessage('Save cancelled — the file is still ready.');
      return;
    }
    setMessage(
      outcome === 'shared'
        ? `Handed ${prepared.filename} to the share sheet.`
        : `Downloaded ${prepared.filename}.`,
    );
  };

  return (
    <>
      {!compact && (
        <div className="small muted" style={{ marginBottom: 10 }}>
          {isTrainer
            ? 'One file holds every chart, note, measurement, clip record, and the video and audio themselves. It imports back on any device.'
            : 'One file holds your chart, your notes and measurements, and your own clips. Other patients in the clinic are not included.'}
        </div>
      )}

      {prepared ? (
        <>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row between">
              <span className="small muted">File</span>
              <strong className="small">{prepared.filename}</strong>
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small muted">Contents</span>
              <strong className="small">
                {prepared.chartCount} chart{prepared.chartCount === 1 ? '' : 's'} ·{' '}
                {prepared.mediaCount} media
              </strong>
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small muted">Size</span>
              <strong className="small">{formatBytes(prepared.byteSize)}</strong>
            </div>
            {prepared.missingMedia > 0 && (
              <div className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>
                {prepared.missingMedia} clip or note has a record but no bytes on this device, so it
                is not in the file.
              </div>
            )}
          </div>

          <button className="btn primary block" onClick={() => void save()}>
            {shareable ? 'Share or save file…' : 'Save file to this device'}
          </button>
          {shareable && (
            <div className="tiny faint" style={{ marginTop: 6 }}>
              On iPhone this opens the share sheet — choose <strong>Save to Files</strong>, AirDrop,
              or Mail.
            </div>
          )}
          <button
            className="btn block ghost"
            style={{ marginTop: 8 }}
            onClick={() => {
              setPrepared(null);
              setMessage('');
            }}
          >
            Build it again
          </button>
        </>
      ) : (
        <button className="btn primary block" onClick={() => void prepare()} disabled={busy}>
          {busy ? 'Building…' : 'Prepare backup file (.zip)'}
        </button>
      )}

      <button className="btn block" style={{ marginTop: 8 }} onClick={exportChartJson}>
        {isTrainer
          ? `Charts only, no media (${exportableClients.length} as JSON)`
          : 'Your chart only, no media (JSON)'}
      </button>

      {message && <div className="notice">{message}</div>}
    </>
  );
}
