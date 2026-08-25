import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import { VideoRecorder } from './VideoRecorder';
import { VideoCompare } from './VideoCompare';
import { clipsForExercise } from '../lib/review';
import { longDate, relativeDay } from '../lib/format';
import { formatBytes } from '../lib/media';

interface MovementSheetProps {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  sessionId: string | null;
  /** Suggested label for a new clip, e.g. "Set 3 — 25 lb × 10". */
  defaultLabel: string;
}

type Mode = 'list' | 'record' | 'compare';

/**
 * Everything about an exercise's movement video in one sheet: the clips, the
 * camera, and the two-up comparison. Reached from the exercise itself in a
 * session or from History — not from a separate videos area.
 */
export function MovementSheet({
  open,
  onClose,
  exerciseId,
  sessionId,
  defaultLabel,
}: MovementSheetProps) {
  const { clips, exerciseName, deleteClip, state } = useApp();
  const [mode, setMode] = useState<Mode>('list');
  /** undefined means "use the default pairing"; null means explicitly cleared. */
  const [leftPick, setLeftPick] = useState<string | null | undefined>(undefined);
  const [rightPick, setRightPick] = useState<string | null | undefined>(undefined);

  const mine = useMemo(() => clipsForExercise(clips, exerciseId), [clips, exerciseId]);
  const isTrainer = state.role === 'trainer';

  // Default the comparison to "last session vs today": newest on the right.
  const rightId = rightPick === undefined ? mine[0]?.id ?? null : rightPick;
  const leftId = leftPick === undefined ? mine[1]?.id ?? null : leftPick;

  const name = exerciseName(exerciseId);

  return (
    <Sheet open={open} title={`Movement — ${name}`} onClose={onClose}>
      <div className="picker-filters">
        <button className="chip" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
          Clips ({mine.length})
        </button>
        <button
          className="chip"
          aria-pressed={mode === 'compare'}
          onClick={() => setMode('compare')}
        >
          ⇄ Compare
        </button>
        <button className="chip" aria-pressed={mode === 'record'} onClick={() => setMode('record')}>
          ⏺ Record
        </button>
      </div>

      {mode === 'list' && (
        <>
          {mine.length === 0 ? (
            <div className="empty">
              No clips for {name} yet.
              <div className="tiny faint" style={{ marginTop: 8 }}>
                Record one rep now and the next one lines up beside it.
              </div>
            </div>
          ) : (
            <div className="clipgrid">
              {mine.map((clip) => (
                <div key={clip.id} className="clipcard">
                  <div className="clipthumb">
                    {clip.posterUrl ? (
                      <img src={clip.posterUrl} alt="" />
                    ) : (
                      <span className="tiny faint">no still</span>
                    )}
                    {clip.placeholder && <span className="pill warn clip-tag">Demo</span>}
                  </div>
                  <div className="grow">
                    <div className="small">
                      <strong>{longDate(clip.recordedAt)}</strong>{' '}
                      <span className="faint tiny">({relativeDay(clip.recordedAt)})</span>
                    </div>
                    <div className="tiny muted">{clip.label || 'Movement clip'}</div>
                    <div className="tiny faint">
                      {clip.durationSec}s · {clip.recordedByName}
                      {clip.byteSize ? ` · ${formatBytes(clip.byteSize)}` : ''}
                    </div>
                    {clip.note && <div className="tiny faint">“{clip.note}”</div>}
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setRightPick(clip.id);
                          setMode('compare');
                        }}
                      >
                        Compare as B
                      </button>
                      <button
                        className="btn sm ghost"
                        onClick={() => {
                          setLeftPick(clip.id);
                          setMode('compare');
                        }}
                      >
                        as A
                      </button>
                      {isTrainer && (
                        <button
                          className="btn sm danger"
                          onClick={() => void deleteClip(clip.id)}
                          aria-label={`Delete clip from ${longDate(clip.recordedAt)}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            onClick={() => setMode('record')}
          >
            ⏺ Record a clip
          </button>
        </>
      )}

      {mode === 'compare' && (
        <>
          {mine.length === 0 ? (
            <div className="empty">Record a clip first, then two dates can sit side by side.</div>
          ) : (
            <VideoCompare
              clips={mine}
              leftId={leftId}
              rightId={rightId}
              onPick={(side, id) => (side === 'left' ? setLeftPick(id || null) : setRightPick(id || null))}
            />
          )}
        </>
      )}

      {mode === 'record' && (
        <VideoRecorder
          exerciseId={exerciseId}
          exerciseLabel={name}
          sessionId={sessionId}
          defaultLabel={defaultLabel}
          onSaved={() => setMode('list')}
          onCancel={() => setMode('list')}
        />
      )}
    </Sheet>
  );
}
