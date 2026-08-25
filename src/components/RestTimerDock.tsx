import { mmss } from '../lib/format';
import type { RestTimerState } from '../hooks/useRestTimer';

interface RestTimerDockProps {
  timer: RestTimerState;
  nextLabel: string;
  onSkip: () => void;
  onStart: () => void;
  canStart: boolean;
  onFinish: () => void;
}

/**
 * Clank's most useful idea: the prescribed rest is on screen the whole time,
 * counting down in numerals big enough to read from across a gym, and it keeps
 * counting up past zero instead of silently disappearing.
 */
export function RestTimerDock({
  timer,
  nextLabel,
  onSkip,
  onStart,
  canStart,
  onFinish,
}: RestTimerDockProps) {
  if (!timer.running) {
    return (
      <div className="dock">
        <div className="dock-inner">
          <div className="startbar">
            <button className="btn grow" onClick={onStart} disabled={!canStart}>
              ⏱ Start rest
            </button>
            <button className="btn primary grow" onClick={onFinish}>
              Finish workout
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = Math.min(100, Math.max(0, (timer.elapsed / timer.duration) * 100));
  const display = timer.overdue ? `+${mmss(-timer.remaining)}` : mmss(timer.remaining);

  return (
    <div className="dock">
      <div className="dock-inner">
        <div className={`timer${timer.overdue ? ' overdue' : ''}`}>
          <div className="timer-top">
            <span className="timer-label">{timer.overdue ? 'Ready — go' : 'Resting'}</span>
            <span className="timer-next">{nextLabel}</span>
          </div>

          <div className="timer-clock" role="timer" aria-live="off">
            {display}
          </div>

          <div className="timer-bar">
            <div className="timer-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="timer-actions">
            <button className="btn sm" onClick={() => timer.extend(15)}>
              +15s
            </button>
            <button className="btn sm" onClick={() => timer.extend(-15)}>
              −15s
            </button>
            <button className="btn sm primary" onClick={onSkip}>
              {timer.overdue ? 'Log next set' : 'Skip rest'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
