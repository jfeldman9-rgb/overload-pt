import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import { therapistLabel } from '../store/seed';
import { relativeDay } from '../lib/format';

/**
 * The clinic roster. A therapist sees their own caseload plus any chart shared
 * with them, and can share a chart they own. Charts nobody shared with them
 * are listed but not openable — the permission is real, not decorative.
 */
export function ClientSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    state,
    therapists,
    actingTherapist,
    visibleClients,
    lockedClients,
    client,
    setActingTherapist,
    setActiveClient,
    setShareWithClinic,
    setShareWithTherapist,
  } = useApp();

  const [reason, setReason] = useState('');
  const isPatientView = state.role === 'patient';

  if (isPatientView) {
    return (
      <Sheet open={open} title="Your chart" onClose={onClose}>
        <div className="card">
          <strong>{client.name}</strong>
          <div className="small muted">{client.condition}</div>
          <div className="tiny faint" style={{ marginTop: 8 }}>
            You are seeing your own workouts, notes, clips, and measurements. Other clients in the
            clinic are not visible from this view.
          </div>
        </div>
        <div className="card">
          <div className="row between">
            <span className="small muted">Your therapist</span>
            <strong className="small">
              {therapists.find((t) => t.id === client.therapistId)?.name ?? '—'}
            </strong>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="small muted">Shared with clinic</span>
            <strong className="small">{client.sharedWithClinic ? 'Yes' : 'No'}</strong>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} title={state.clinicName} onClose={onClose}>
      <div className="section-label">Signed in as</div>
      <div className="stack">
        {therapists.map((t) => (
          <button
            key={t.id}
            className="rosteritem"
            aria-pressed={t.id === actingTherapist.id}
            onClick={() => setActingTherapist(t.id)}
          >
            <span className="grow">
              <strong className="small">{therapistLabel(t)}</strong>
              <span className="tiny faint" style={{ display: 'block' }}>
                {state.clients.filter((c) => c.therapistId === t.id).length} own caseload ·{' '}
                {state.clients.filter((c) => c.therapistId !== t.id && (c.sharedWithClinic || c.sharedTherapistIds.includes(t.id))).length}{' '}
                shared in
              </span>
            </span>
            {t.id === actingTherapist.id && <span className="pill accent">You</span>}
          </button>
        ))}
      </div>

      <div className="section-label">Caseload</div>
      <div className="stack">
        {visibleClients.map((c) => {
          const owned = c.therapistId === actingTherapist.id;
          const lastSession = [...c.sessions]
            .filter((s) => s.status === 'completed')
            .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
          return (
            <div key={c.id} className={`rostercard${c.id === client.id ? ' current' : ''}`}>
              <button
                className="rosteropen"
                onClick={() => {
                  setActiveClient(c.id);
                  onClose();
                }}
              >
                <span className="grow">
                  <strong>{c.name}</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {c.condition}
                  </span>
                  <span className="tiny faint" style={{ display: 'block', marginTop: 2 }}>
                    {owned ? 'Your patient' : `Shared from ${therapists.find((t) => t.id === c.therapistId)?.name ?? 'colleague'}`}
                    {lastSession ? ` · last visit ${relativeDay(lastSession.startedAt)}` : ' · no visits yet'}
                    {' · '}
                    {c.clips.length} clip{c.clips.length === 1 ? '' : 's'} · {c.bodyMetrics.length} measurements
                  </span>
                </span>
                {c.id === client.id ? (
                  <span className="pill accent">Open</span>
                ) : (
                  <span className="pill">View</span>
                )}
              </button>

              {owned && (
                <div className="rostershare">
                  <label className="toggle" style={{ paddingBottom: 6 }}>
                    <span className="grow tiny">
                      Share with clinic — any therapist here can open the chart
                    </span>
                    <input
                      type="checkbox"
                      checked={c.sharedWithClinic}
                      onChange={(e) => setShareWithClinic(c.id, e.target.checked, reason.trim() || undefined)}
                      aria-label={`Share ${c.name} with clinic`}
                      style={{ width: 24, height: 24 }}
                    />
                  </label>
                  {therapists
                    .filter((t) => t.id !== actingTherapist.id)
                    .map((t) => (
                      <label key={t.id} className="toggle" style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <span className="grow tiny">Share with {t.name}</span>
                        <input
                          type="checkbox"
                          checked={c.sharedTherapistIds.includes(t.id) || c.sharedWithClinic}
                          disabled={c.sharedWithClinic}
                          onChange={(e) => setShareWithTherapist(c.id, t.id, e.target.checked)}
                          aria-label={`Share ${c.name} with ${t.name}`}
                          style={{ width: 24, height: 24 }}
                        />
                      </label>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lockedClients.length > 0 && (
        <>
          <div className="section-label">Not shared with you</div>
          <div className="stack">
            {lockedClients.map((c) => (
              <div key={c.id} className="rostercard locked">
                <div className="row between">
                  <div className="grow">
                    <strong className="small">{c.name}</strong>
                    <div className="tiny faint">
                      {therapists.find((t) => t.id === c.therapistId)?.name ?? 'Another therapist'}
                      's patient · chart not shared
                    </div>
                  </div>
                  <span className="pill">🔒 Locked</span>
                </div>
              </div>
            ))}
          </div>
          <div className="tiny faint" style={{ marginTop: 8 }}>
            Only the owning therapist can open sharing. Switch to them above to hand the chart over.
          </div>
        </>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="share-reason">Reason for a sharing change (recorded in the log)</label>
        <input
          id="share-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Out Thursday — cover needs the chart"
        />
      </div>
    </Sheet>
  );
}
