import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import { backup, backupLabel, backupTone } from '../lib/backup';
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
  const { backupStatus, retryBackup, exportChartJson, exportMediaFiles, importChartJson, importMediaFiles } =
    useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const label = backupLabel(backupStatus);
  const tone = backupTone(backupStatus);
  const queue = backup.queue();

  return (
    <>
      <button
        className={`backupbar ${tone}`}
        onClick={() => setOpen(true)}
        aria-label={`Backup status: ${label}`}
      >
        <span className="backupdot" aria-hidden="true" />
        <span className="grow">
          <strong>{label}</strong>
          {backupStatus.pending > 0 && (
            <span className="faint">
              {' '}
              · {backupStatus.pending} change{backupStatus.pending === 1 ? '' : 's'} waiting
            </span>
          )}
          {backupStatus.pending === 0 && backupStatus.lastLocalWriteAt && (
            <span className="faint"> · saved {clockTime(backupStatus.lastLocalWriteAt)}</span>
          )}
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
            IndexedDB and held in the queue below. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> and the queue drains on the next change. Until
            then, use Export to get a copy off the device.
          </div>
        )}

        {backupStatus.lastError && <div className="notice danger">{backupStatus.lastError}</div>}

        <div className="section-label">Queue ({queue.length})</div>
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
            Data should never be trapped in one app. JSON holds every chart, note, metric, and clip
            record; media files download alongside it and re-import by filename.
          </div>
          <button className="btn block" onClick={exportChartJson}>
            Export all charts (JSON)
          </button>
          <button
            className="btn block"
            style={{ marginTop: 8 }}
            onClick={() =>
              void exportMediaFiles().then((n) =>
                setMessage(n ? `Downloaded ${n} media file(s).` : 'No recorded media on this device yet.'),
              )
            }
          >
            Export video + audio files
          </button>
        </div>

        <div className="section-label">Import</div>
        <div className="card">
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

        {message && <div className="notice">{message}</div>}
      </Sheet>
    </>
  );
}
