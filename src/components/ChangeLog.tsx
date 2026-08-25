import type { AuditEvent } from '../types';
import { clockTime, shortDate } from '../lib/format';

const FIELD_LABELS: Record<string, string> = {
  targetWeight: 'Target weight',
  targetReps: 'Target reps',
  targetRepsMax: 'Rep range top',
  targetSets: 'Target sets',
  restSec: 'Rest',
  cue: 'Coaching cue',
  order: 'Order',
  sets: 'Set count',
  exercise: 'Exercise swapped',
  'exercise added': 'Exercise added',
  'exercise removed': 'Exercise removed',
};

const ICONS: Record<string, string> = {
  prescription: '⚙',
  program_day: '📋',
  session: '▶',
  set: '#',
  exercise_swap: '⇄',
  settings: '⚙',
};

function renderValue(value: string | number | null): string {
  if (value === null || value === '') return '—';
  return String(value);
}

export function ChangeLog({ events, limit }: { events: AuditEvent[]; limit?: number }) {
  if (!events.length) return <div className="empty">No changes recorded yet.</div>;

  const shown = limit ? events.slice(0, limit) : events;

  return (
    <div>
      {shown.map((e) => (
        <div key={e.id} className="change">
          <div className="change-icon">{ICONS[e.entity] ?? '•'}</div>
          <div className="grow">
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <strong style={{ fontSize: 13.5 }}>{e.entityLabel}</strong>
              <span className="tiny faint">
                {shortDate(e.at)} {clockTime(e.at)}
              </span>
            </div>
            <div className="small muted">
              {FIELD_LABELS[e.field] ?? e.field}{' '}
              <span className="delta">
                <span className="from">{renderValue(e.from)}</span>
                {' → '}
                <span className="to">{renderValue(e.to)}</span>
              </span>
            </div>
            <div className="tiny faint" style={{ marginTop: 2 }}>
              {e.actorName}
              {e.reason ? ` — ${e.reason}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
