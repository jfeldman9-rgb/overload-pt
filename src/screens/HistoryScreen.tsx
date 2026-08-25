import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { ChangeLog } from '../components/ChangeLog';
import { NotesLedger } from '../components/NotesLedger';
import { Sparkline } from '../components/Sparkline';
import { TrendChart } from '../components/TrendChart';
import { BigTile } from '../components/BigTile';
import { Sheet } from '../components/Sheet';
import { MovementSheet } from '../components/MovementSheet';
import { durationBetween, longDate, mmss, relativeDay, shortDate, weight } from '../lib/format';
import {
  completedSets,
  entryVolume,
  exerciseHistory,
  sessionVolume,
  summarizeSession,
} from '../lib/overload';
import {
  clipsForExercise,
  filmedMovements,
  restCompliance,
  restComplianceLabel,
  weeklyRollup,
} from '../lib/review';
import { metricDelta, metricSeries } from '../lib/metrics';
import type { Session } from '../types';
import type { Tab } from '../App';

type View = 'overview' | 'movement' | 'lifts' | 'sessions' | 'changes' | 'notes';

const VIEWS: View[] = ['overview', 'movement', 'lifts', 'sessions', 'changes', 'notes'];

export function HistoryScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { state, client, sessions, notes, voiceNotes, audit, clips, bodyMetrics, exerciseName } =
    useApp();
  const [view, setView] = useState<View>('overview');
  const [detail, setDetail] = useState<Session | null>(null);
  const [videoFor, setVideoFor] = useState<string | null>(null);

  const units = state.settings.units;

  const completed = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [sessions],
  );

  const weeks = useMemo(() => weeklyRollup(client), [client]);
  const thisWeek = weeks[weeks.length - 1] ?? null;
  const priorWeek = weeks[weeks.length - 2] ?? null;

  const trackedExercises = useMemo(() => {
    const ids = new Set<string>();
    for (const s of completed) for (const e of s.entries) ids.add(e.exerciseId);
    return [...ids]
      .map((id) => ({ id, points: exerciseHistory(sessions, id) }))
      .filter((x) => x.points.length >= 1)
      .sort((a, b) => b.points.length - a.points.length);
  }, [completed, sessions]);

  const sessionNameFor = (id: string | null) =>
    sessions.find((s) => s.id === id)?.name ?? 'Session';

  // Organised by movement, not by session: the question is how a lift looks
  // now against a month ago.
  const movements = useMemo(() => filmedMovements(clips), [clips]);

  const weightDelta = metricDelta(bodyMetrics, 'bodyweight');
  const waistDelta = metricDelta(bodyMetrics, 'waist');
  const bfDelta = metricDelta(bodyMetrics, 'bodyFatPct');

  const volumeDelta =
    thisWeek && priorWeek && priorWeek.volume
      ? ((thisWeek.volume - priorWeek.volume) / priorWeek.volume) * 100
      : null;

  return (
    <>
      <div className="picker-filters">
        {VIEWS.map((v) => (
          <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'overview'
              ? 'Overview'
              : v === 'movement'
                ? `🎥 Movement (${clips.length})`
                : v === 'lifts'
                  ? 'Lifts'
                  : v === 'sessions'
                    ? 'Sessions'
                    : v === 'changes'
                      ? `Changes (${audit.length})`
                      : 'Notes'}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <>
          {completed.length === 0 ? (
            <div className="empty">No completed sessions yet.</div>
          ) : (
            <>
              <div className="section-label">This week</div>
              <div className="stats">
                <BigTile
                  label={`Volume ${units}`}
                  value={Math.round(thisWeek?.volume ?? 0).toLocaleString()}
                  delta={
                    volumeDelta == null
                      ? undefined
                      : `${volumeDelta >= 0 ? '+' : ''}${Math.round(volumeDelta)}%`
                  }
                  deltaTone={volumeDelta == null ? 'flat' : volumeDelta >= 0 ? 'good' : 'bad'}
                  sub="vs last week"
                />
                <BigTile
                  label="Sessions"
                  value={String(thisWeek?.sessions ?? 0)}
                  delta={
                    priorWeek ? `${(thisWeek?.sessions ?? 0) - priorWeek.sessions >= 0 ? '+' : ''}${(thisWeek?.sessions ?? 0) - priorWeek.sessions}` : undefined
                  }
                  deltaTone="flat"
                  sub={`${thisWeek?.sets ?? 0} sets`}
                />
                <BigTile
                  label="Peak pain"
                  value={thisWeek?.maxPain == null ? '—' : `${thisWeek.maxPain}`}
                  delta={
                    thisWeek?.maxPain != null && priorWeek?.maxPain != null
                      ? `${thisWeek.maxPain - priorWeek.maxPain >= 0 ? '+' : ''}${thisWeek.maxPain - priorWeek.maxPain}`
                      : undefined
                  }
                  deltaTone={
                    thisWeek?.maxPain != null && priorWeek?.maxPain != null
                      ? thisWeek.maxPain > priorWeek.maxPain
                        ? 'bad'
                        : thisWeek.maxPain < priorWeek.maxPain
                          ? 'good'
                          : 'flat'
                      : 'flat'
                  }
                  sub="out of 10"
                />
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="row between">
                  <strong className="small">Weekly volume</strong>
                  <span className="tiny faint">{weeks.length} weeks</span>
                </div>
                <TrendChart
                  points={weeks.map((w) => ({ at: w.weekStart, value: Math.round(w.volume) }))}
                  ariaLabel="Weekly training volume"
                  tone="good"
                  unit={units}
                  decimals={0}
                />
              </div>

              <div className="card">
                <div className="row between">
                  <strong className="small">Rest actually taken</strong>
                  <span className="tiny faint">100% = as prescribed</span>
                </div>
                <TrendChart
                  points={weeks
                    .filter((w) => w.restPct != null)
                    .map((w) => ({ at: w.weekStart, value: w.restPct as number }))}
                  ariaLabel="Weekly rest compliance"
                  tone="flat"
                  unit="%"
                  decimals={0}
                />
              </div>

              <div className="section-label">Composition</div>
              <div className="card">
                {bodyMetrics.length === 0 ? (
                  <div className="tiny faint">
                    No body measurements yet. Log a waist and body fat percentage to see the trend
                    here.
                  </div>
                ) : (
                  <>
                    <div className="stats">
                      {[
                        { label: 'Weight', d: weightDelta, unit: units },
                        { label: 'BF%', d: bfDelta, unit: '%' },
                        { label: 'Waist', d: waistDelta, unit: state.settings.lengthUnits },
                      ].map(({ label, d }) => (
                        <BigTile
                          key={label}
                          label={label}
                          value={d ? String(Number(d.latest.value.toFixed(1))) : '—'}
                          delta={
                            d?.delta == null
                              ? undefined
                              : `${d.delta > 0 ? '+' : ''}${Number(d.delta.toFixed(1))}`
                          }
                          deltaTone={
                            d?.delta == null || Math.abs(d.delta) < 0.05
                              ? 'flat'
                              : label === 'Weight'
                                ? 'flat'
                                : d.delta < 0
                                  ? 'good'
                                  : 'bad'
                          }
                          sub={d?.spanDays ? `over ${d.spanDays}d` : undefined}
                        />
                      ))}
                    </div>
                    <TrendChart
                      points={metricSeries(bodyMetrics, 'waist')}
                      ariaLabel="Waist trend"
                      tone="good"
                      unit={state.settings.lengthUnits}
                    />
                  </>
                )}
                <button
                  className="btn block"
                  style={{ marginTop: 10 }}
                  onClick={() => onNavigate('body')}
                >
                  Open Body history
                </button>
              </div>
            </>
          )}
        </>
      )}

      {view === 'movement' &&
        (movements.length === 0 ? (
          <div className="empty">
            No movement clips yet.
            <div className="tiny faint" style={{ marginTop: 8 }}>
              Film a set during a workout — tap <strong>Film set</strong> under the set you are on —
              and every clip of that lift collects here by date.
            </div>
          </div>
        ) : (
          <>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Every filmed movement, newest first. Open one to see its clips by date and put any two
              side by side.
            </div>
            {movements.map((movement) => (
              <button
                key={movement.exerciseId}
                className="card movementcard"
                onClick={() => setVideoFor(movement.exerciseId)}
              >
                <div className="row between">
                  <div className="grow">
                    <strong>{exerciseName(movement.exerciseId)}</strong>
                    <div className="small muted">
                      {movement.clips.length} clip{movement.clips.length === 1 ? '' : 's'} across{' '}
                      {movement.dayCount} date{movement.dayCount === 1 ? '' : 's'} · latest{' '}
                      {relativeDay(movement.latestAt)}
                    </div>
                  </div>
                  {movement.dayCount > 1 && <span className="pill accent">Compare</span>}
                </div>
                <div className="cliprow">
                  {movement.clips.slice(0, 6).map((clip) => (
                    <span key={clip.id} className="movementthumb">
                      {clip.posterUrl ? <img src={clip.posterUrl} alt="" /> : <span>▶</span>}
                      <span className="tiny">{shortDate(clip.recordedAt)}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </>
        ))}

      {view === 'lifts' &&
        (trackedExercises.length === 0 ? (
          <div className="empty">Log a session to start tracking overload.</div>
        ) : (
          trackedExercises.map(({ id, points }) => {
            const first = points[0];
            const last = points[points.length - 1];
            const volumeChange = first.volume
              ? ((last.volume - first.volume) / first.volume) * 100
              : 0;
            const clipCount = clipsForExercise(clips, id).length;
            const restPoints = points.filter((p) => p.avgRestSec != null);
            const painPoints = points.filter((p) => p.maxPain != null);

            return (
              <div key={id} className="card">
                <div className="row between">
                  <strong>{exerciseName(id)}</strong>
                  <span className="tiny faint">{points.length} sessions</span>
                </div>

                <div className="stats" style={{ marginTop: 10 }}>
                  <BigTile
                    label={`Top ${units}`}
                    value={last.topWeight ? String(last.topWeight) : 'BW'}
                    delta={
                      points.length > 1
                        ? `${last.topWeight - points[points.length - 2].topWeight >= 0 ? '+' : ''}${
                            last.topWeight - points[points.length - 2].topWeight
                          }`
                        : undefined
                    }
                    deltaTone={
                      points.length > 1 && last.topWeight > points[points.length - 2].topWeight
                        ? 'good'
                        : 'flat'
                    }
                  />
                  <BigTile
                    label="Est. 1RM"
                    value={last.e1rm ? String(last.e1rm) : '—'}
                    sub="Epley"
                  />
                  <BigTile
                    label="Volume"
                    value={Math.round(last.volume).toLocaleString()}
                    delta={`${volumeChange >= 0 ? '+' : ''}${Math.round(volumeChange)}%`}
                    deltaTone={volumeChange >= 0 ? 'good' : 'bad'}
                    sub="since first"
                  />
                </div>

                <div className="stats" style={{ marginTop: 8 }}>
                  <BigTile
                    label="Rest taken"
                    value={last.avgRestSec == null ? '—' : mmss(last.avgRestSec)}
                    sub={`prescribed ${mmss(last.prescribedRestSec)}`}
                    deltaTone="flat"
                  />
                  <BigTile
                    label="Peak pain"
                    value={last.maxPain == null ? '—' : `${last.maxPain}/10`}
                    sub={painPoints.length > 1 ? `${painPoints.length} logged` : undefined}
                  />
                  <BigTile
                    label="Clips"
                    value={String(clipCount)}
                    sub={clipCount ? 'tap to compare' : 'record one'}
                    onClick={() => setVideoFor(id)}
                  />
                </div>

                <TrendChart
                  points={points.map((p) => ({ at: p.date, value: p.e1rm || p.volume || p.totalReps }))}
                  ariaLabel={`${exerciseName(id)} strength trend`}
                  tone="good"
                  decimals={0}
                />

                {restPoints.length > 2 && (
                  <Sparkline
                    values={restPoints.map((p) => p.avgRestSec as number)}
                    ariaLabel={`${exerciseName(id)} rest taken`}
                  />
                )}

                {points.length > 1 && (
                  <div className="tiny faint" style={{ marginTop: 6 }}>
                    {volumeChange >= 0 ? '▲' : '▼'} {Math.abs(Math.round(volumeChange))}% session
                    volume since {longDate(first.date)}
                  </div>
                )}

                <button
                  className="btn sm block"
                  style={{ marginTop: 10 }}
                  onClick={() => setVideoFor(id)}
                >
                  🎥 Movement video ({clipCount})
                </button>
              </div>
            );
          })
        ))}

      {view === 'sessions' &&
        (completed.length === 0 ? (
          <div className="empty">No completed sessions yet.</div>
        ) : (
          completed.map((s) => {
            const summary = summarizeSession(s, sessions);
            const rest = restCompliance(s);
            return (
              <button
                key={s.id}
                className="card"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setDetail(s)}
              >
                <div className="row between">
                  <div className="grow">
                    <strong>{s.name}</strong>
                    <div className="small muted">
                      {longDate(s.startedAt)} · {durationBetween(s.startedAt, s.endedAt)}
                    </div>
                  </div>
                  {summary.prCount > 0 && <span className="pill accent">{summary.prCount} PR</span>}
                </div>
                <div className="stats" style={{ marginTop: 10 }}>
                  <div className="stat">
                    <div className="value">{Math.round(summary.volume).toLocaleString()}</div>
                    <div className="label">Volume</div>
                  </div>
                  <div className="stat">
                    <div className="value">{summary.sets}</div>
                    <div className="label">Sets</div>
                  </div>
                  <div className="stat">
                    <div className="value">
                      {summary.volumeDelta == null
                        ? '—'
                        : `${summary.volumeDelta >= 0 ? '+' : ''}${Math.round(summary.volumeDelta)}`}
                    </div>
                    <div className="label">Δ Volume</div>
                  </div>
                </div>
                <div className="tiny faint" style={{ marginTop: 6 }}>
                  Rest {restComplianceLabel(rest)}
                </div>
              </button>
            );
          })
        ))}

      {view === 'changes' && (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 6 }}>
            Every prescription edit, exercise swap, sharing change, and set adjustment — who made
            it, when, and why.
          </div>
          <ChangeLog events={audit} />
        </div>
      )}

      {view === 'notes' && (
        <div className="card">
          <NotesLedger notes={notes} sessionNameFor={sessionNameFor} voiceNotes={voiceNotes} />
        </div>
      )}

      <Sheet open={detail !== null} title={detail?.name ?? ''} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <div className="small muted" style={{ marginBottom: 12 }}>
              {longDate(detail.startedAt)} · {durationBetween(detail.startedAt, detail.endedAt)} ·{' '}
              {weight(sessionVolume(detail), units)} total volume
            </div>

            {detail.entries.map((entry) => {
              const entryClips = clipsForExercise(clips, entry.exerciseId).filter(
                (c) => c.sessionId === detail.id,
              );
              return (
                <div key={entry.id} className="card">
                  <div className="row between">
                    <strong className="small">{exerciseName(entry.exerciseId)}</strong>
                    <button className="btn sm" onClick={() => setVideoFor(entry.exerciseId)}>
                      🎥 {entryClips.length || ''}
                    </button>
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {completedSets(entry)
                      .map((s) => `${s.weight || 'BW'}×${s.reps}`)
                      .join('  ·  ') || 'No sets logged'}
                  </div>
                  <div className="tiny faint" style={{ marginTop: 4 }}>
                    {Math.round(entryVolume(entry)).toLocaleString()} {units} ·{' '}
                    {completedSets(entry).length} sets
                  </div>
                  {entryClips.length > 0 && (
                    <div className="cliprow">
                      {entryClips.map((clip) => (
                        <button
                          key={clip.id}
                          className="clipthumb small-thumb"
                          onClick={() => setVideoFor(entry.exerciseId)}
                          aria-label={`Open clip from ${shortDate(clip.recordedAt)}`}
                        >
                          {clip.posterUrl && <img src={clip.posterUrl} alt="" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {entry.note && (
                    <div className="lastperf" style={{ marginTop: 8 }}>
                      {entry.note}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="section-label">Notes from this session</div>
            <NotesLedger
              notes={notes.filter((n) => n.sessionId === detail.id)}
              emptyText="No notes attached to this session."
              voiceNotes={voiceNotes}
            />
          </>
        )}
      </Sheet>

      {videoFor && (
        <MovementSheet
          open
          onClose={() => setVideoFor(null)}
          exerciseId={videoFor}
          sessionId={null}
          defaultLabel={exerciseName(videoFor)}
        />
      )}
    </>
  );
}
