import { useEffect, useRef, useState } from 'react';
import type { MovementClip } from '../types';
import { shortDate } from '../lib/format';
import { formatBytes, useBlobUrl } from '../lib/media';

interface VideoCompareProps {
  clips: MovementClip[];
  leftId: string | null;
  rightId: string | null;
  onPick: (side: 'left' | 'right', clipId: string) => void;
}

const RATES = [1, 0.5, 0.25];

function ComparePanel({
  side,
  clip,
  videoRef,
}: {
  side: 'A' | 'B';
  clip: MovementClip | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const url = useBlobUrl(clip?.blobKey);

  if (!clip) {
    return (
      <div className="compare-panel">
        <div className="compare-head">
          <span className="pill">{side}</span>
          <span className="tiny faint">Pick a clip</span>
        </div>
        <div className="compare-frame empty-frame">
          <span className="tiny faint">No clip selected</span>
        </div>
      </div>
    );
  }

  const missing = !url;

  return (
    <div className="compare-panel">
      <div className="compare-head">
        <span className="pill">{side}</span>
        <span className="grow tiny">
          <strong>{shortDate(clip.recordedAt)}</strong>
          {clip.label ? ` · ${clip.label}` : ''}
        </span>
        {clip.placeholder && <span className="pill warn">Demo</span>}
      </div>
      <div className="compare-frame">
        {missing ? (
          <>
            {clip.posterUrl && <img src={clip.posterUrl} alt="" />}
            <div className="frame-overlay">
              <span className="tiny">
                {clip.placeholder
                  ? 'Demo placeholder — record a clip to replace it.'
                  : 'Video data is not on this device.'}
              </span>
            </div>
          </>
        ) : (
          <video
            ref={videoRef}
            src={url}
            poster={clip.posterUrl || undefined}
            playsInline
            controls
            preload="metadata"
          />
        )}
      </div>
      <div className="tiny faint compare-meta">
        {clip.recordedByName} · {clip.durationSec}s
        {clip.byteSize ? ` · ${formatBytes(clip.byteSize)}` : ''}
        {clip.note ? ` · ${clip.note}` : ''}
      </div>
    </div>
  );
}

/**
 * Two clips, stacked on a phone and side by side once there is width for it.
 * Each plays on its own; "Play both" runs them together for a same-tempo
 * comparison, and the speed control applies to both at once.
 */
export function VideoCompare({ clips, leftId, rightId, onPick }: VideoCompareProps) {
  const leftRef = useRef<HTMLVideoElement | null>(null);
  const rightRef = useRef<HTMLVideoElement | null>(null);
  const [rate, setRate] = useState(1);

  const left = clips.find((c) => c.id === leftId) ?? null;
  const right = clips.find((c) => c.id === rightId) ?? null;

  useEffect(() => {
    for (const ref of [leftRef, rightRef]) {
      if (ref.current) ref.current.playbackRate = rate;
    }
  }, [rate, leftId, rightId]);

  const both = (fn: (video: HTMLVideoElement) => void) => {
    for (const ref of [leftRef, rightRef]) {
      if (ref.current) fn(ref.current);
    }
  };

  return (
    <div className="compare">
      <div className="compare-pickers">
        {(['left', 'right'] as const).map((side) => (
          <div key={side} className="field">
            <label htmlFor={`compare-${side}`}>{side === 'left' ? 'A' : 'B'}</label>
            <select
              id={`compare-${side}`}
              value={(side === 'left' ? leftId : rightId) ?? ''}
              onChange={(e) => onPick(side, e.target.value)}
            >
              <option value="">— none —</option>
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {shortDate(clip.recordedAt)}
                  {clip.label ? ` · ${clip.label}` : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="compare-grid">
        <ComparePanel side="A" clip={left} videoRef={leftRef} />
        <ComparePanel side="B" clip={right} videoRef={rightRef} />
      </div>

      <div className="compare-controls">
        <button
          className="btn sm primary grow"
          onClick={() =>
            both((v) => {
              v.currentTime = 0;
              void v.play();
            })
          }
        >
          ▶ Play both
        </button>
        <button className="btn sm grow" onClick={() => both((v) => v.pause())}>
          ⏸ Pause both
        </button>
        <button
          className="btn sm grow"
          onClick={() =>
            both((v) => {
              v.pause();
              v.currentTime = 0;
            })
          }
        >
          ↺ Reset
        </button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <span className="tiny faint">Speed</span>
        {RATES.map((r) => (
          <button key={r} className="chip" aria-pressed={rate === r} onClick={() => setRate(r)}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
