import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import { backup, backupDetail, backupLabel, backupTone } from '../lib/backup';
import { storageKind } from '../lib/idb';
import { clockTime, shortDate } from '../lib/format';

function when(iso: string | null): string {
  if (!iso) return 'never';
  return `${shortDate(iso)} ${clockTime(iso)}`;
}

/**
 * One always-visible line of truth about where the data is. It says "On this
 * device" until a cloud copy actually exists, because a backup indicator that
 * lies is worse than no indicator.
 */
export function BackupBar() {
  const {
    state,
    client,
    exportableClients,
    backupStatus,
    retryBackup,
    exportChartJson,
    exportMediaFiles,
    importChartJson,
    importMediaFiles,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const label = backupLabel(backupStatus);
  const detail = backupDetail(backupStatus);
  const tone = backupTone(backupStatus);
  const isTrainer = state.role === 'trainer';

  // A client sees the queue for their own chart, not the clinic's.
  const queue = backup
    .queue()
    .filter((item) => isTrainer || item.clientId === null || item.clientId === client.id);

  const exportLabel = isTrainer
    ? `Export all charts (${exportableClients.length}) as JSON`
    : 'Export your chart (JSON)';

  return (
    <>
      <button
        className={`backupbar ${tone}`}
        onClick={() => setOpen(true)}
        aria-label={`Backup status: ${label}, ${detail}`}
      >
        <span className="backupdot" aria-hidden="true" />
        <span className="grow">
          <strong>{label}</strong>
          <span className="faint"> · {detail}</span>
        </span>
        <span className="tiny faint" aria-hidden="true">
          Details
        </span>
      </button>

      <Sheet open={open} title="Backup" onClose={() => setOpen(false)}>
        <div className="card">
          <div className="row between">
            <span className="small muted">On this device</span>
            <strong className="small">
              {storageKind() === 'indexeddb' ? 'IndexedDB' : 'Fallback storage'}
            </strong>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small muted">Last local write</span>
            <strong className="small">{when(backupStatus.lastLocalWriteAt)}</strong>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small muted">Cloud target</span>
            <strong className="small">
              {backupStatus.configured ? 'Supabase' : 'Not configured'}
            </strong>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small muted">Last cloud sync</span>
            <strong className="small">{when(backupStatus.lastSyncedAt)}</strong>
          </div>
        </div>

        {!backupStatus.configured && (
          <div className="notice">
            No Supabase keys are set, so nothing has left this device. Every change is written to
            IndexedDB and held in the queue below; it uploads once keys are present. Add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable it.
            Until then, use Export to get a copy off the device.
          </div>
        )}

        {storageKind() !== 'indexeddb' && (
          <div className="notice warn">
            IndexedDB is unavailable in this browser, so the app fell back to a smaller store.
            Recorded video and audio only last for this session — export anything you want to keep.
          </div>
        )}

        {backupStatus.lastError && <div className="notice danger">{backupStatus.lastError}</div>}

        <div className="section-label">Waiting to upload ({queue.length})</div>
        {queue.length === 0 ? (
          <div className="empty">Nothing waiting.</div>
        ) : (
          <div className="card">
            {queue.slice(0, 12).map((item) => (
              <div key={item.id} className="change">
                <div className="change-icon">
                  {item.kind === 'chart' ? '📄' : item.kind === 'clip' ? '🎥' : '🎙'}
                </div>
                <div className="grow">
                  <div className="small">{item.summary}</div>
                  <div className="tiny faint">
                    {when(item.at)}
                    {item.attempts > 0 ? ` · ${item.attempts} attempt(s)` : ''}
                    {item.lastError ? ` · ${item.lastError}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {queue.length > 12 && (
              <div className="tiny faint" style={{ marginTop: 8 }}>
                and {queue.length - 12} more
              </div>
            )}
          </div>
        )}

        {backupStatus.configured && (
          <button className="btn block" onClick={() => void retryBackup()}>
            Retry cloud backup now
          </button>
        )}

        <div className="section-label">Export a copy</div>
        <div className="card">
          <div className="small muted" style={{ marginBottom: 10 }}>
            {isTrainer
              ? 'Data should never be trapped in one app. JSON holds every chart, note, measurement, and clip record; media files download alongside it and re-import by filename.'
              : 'Your own chart only — notes, measurements, and your clip records. Other patients in the clinic are not included.'}
          </div>
          <button className="btn block" onClick={exportChartJson}>
            {exportLabel}
          </button>
          <button
            className="btn block"
            style={{ marginTop: 8 }}
            onClick={() =>
              void exportMediaFiles().then((n) =>
                setMessage(
                  n ? `Downloaded ${n} media file(s).` : 'No recorded media on this device yet.',
                ),
              )
            }
          >
            Export video + audio files
          </button>
        </div>

        {isTrainer ? (
          <>
            <div className="section-label">Import</div>
            <div className="card">
              <div className="tiny faint" style={{ marginBottom: 10 }}>
                Importing charts replaces everything currently on this device.
              </div>
              <div className="field">
                <label htmlFor="import-json">Charts (JSON)</label>
                <input
                  id="import-json"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void importChartJson(file)
                      .then((summary) => setMessage(`Imported ${summary}`))
                      .catch((error: unknown) =>
                        setMessage(error instanceof Error ? error.message : 'Import failed.'),
                      );
                  }}
                />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label htmlFor="import-media">Media files</label>
                <input
                  id="import-media"
                  type="file"
                  multiple
                  accept="video/*,audio/*"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    void importMediaFiles(files).then((n) =>
                      setMessage(`Restored ${n} media file(s).`),
                    );
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="tiny faint" style={{ marginTop: 12 }}>
            Restoring a backup replaces every chart on the device, so your therapist does that side.
          </div>
        )}

        {message && <div className="notice">{message}</div>}
      </Sheet>
    </>
  );
}
