import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { BigTile } from '../components/BigTile';
import { TrendChart } from '../components/TrendChart';
import { BodyMetricSheet } from '../components/BodyMetricSheet';
import { longDate, relativeDay } from '../lib/format';
import {
  CALIPER_SITES,
  METRIC_META,
  caliperSum,
  deltaTone,
  filledFields,
  formatDelta,
  formatValue,
  latestDexa,
  metricDelta,
  metricSeries,
  sortedMetrics,
} from '../lib/metrics';
import type { BodyMetricField } from '../types';

export function BodyScreen() {
  const { state, bodyMetrics, deleteBodyMetric } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<BodyMetricField>('waist');
  const units = state.settings.units;
  const lengths = state.settings.lengthUnits;
  const isTrainer = state.role === 'trainer';

  const entries = useMemo(() => sortedMetrics(bodyMetrics).reverse(), [bodyMetrics]);
  const latest = entries[0] ?? null;

  const caliperPoints = useMemo(
    () =>
      sortedMetrics(bodyMetrics).flatMap((m) => {
        const sum = caliperSum(m.calipers);
        return sum == null ? [] : [{ at: m.at, value: sum }];
      }),
    [bodyMetrics],
  );

  const dexaEntry = useMemo(() => latestDexa(bodyMetrics), [bodyMetrics]);
  const priorDexa = useMemo(
    () =>
      sortedMetrics(bodyMetrics)
        .filter((m) => m.dexa != null && m.id !== dexaEntry?.id)
        .pop() ?? null,
    [bodyMetrics, dexaEntry],
  );

  const meta = METRIC_META.find((m) => m.field === selected) ?? METRIC_META[0];
  const selectedDelta = metricDelta(bodyMetrics, selected);

  if (!bodyMetrics.length) {
    return (
      <>
        <div className="empty">
          No measurements logged yet.
          <div className="tiny faint" style={{ marginTop: 8 }}>
            One number is a valid entry. Waist and body fat are the two that move first.
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => setSheetOpen(true)}>
              + Log measurements
            </button>
          </div>
        </div>
        <BodyMetricSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <div className="grow">
            <strong>Latest measurement</strong>
            <div className="small muted">
              {latest ? `${longDate(latest.at)} (${relativeDay(latest.at)})` : '—'}
            </div>
            <div className="tiny faint">
              {latest ? `logged by ${latest.loggedByName}` : ''}
              {latest?.note ? ` · ${latest.note}` : ''}
            </div>
          </div>
          <button className="btn primary sm" onClick={() => setSheetOpen(true)}>
            + Log
          </button>
        </div>
      </div>

      <div className="section-label">Week over week</div>
      <div className="tilegrid">
        {METRIC_META.map((m) => {
          const d = metricDelta(bodyMetrics, m.field);
          if (!d) return null;
          return (
            <BigTile
              key={m.field}
              label={m.short}
              value={formatValue(d.latest.value, m.decimals)}
              unit={m.unit(units, lengths) === '%' ? '%' : undefined}
              delta={formatDelta(d.delta, m.decimals)}
              deltaTone={deltaTone(d.delta, m.better)}
              sub={d.spanDays ? `over ${d.spanDays}d` : m.unit(units, lengths)}
              onClick={() => setSelected(m.field)}
            />
          );
        })}
      </div>

      <div className="section-label">Trend</div>
      <div className="picker-filters">
        {METRIC_META.filter((m) => metricSeries(bodyMetrics, m.field).length > 0).map((m) => (
          <button
            key={m.field}
            className="chip"
            aria-pressed={selected === m.field}
            onClick={() => setSelected(m.field)}
          >
            {m.short}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <strong className="small">{meta.label}</strong>
          <span className="tiny faint">{meta.unit(units, lengths)}</span>
        </div>
        <TrendChart
          points={metricSeries(bodyMetrics, selected)}
          ariaLabel={`${meta.label} trend`}
          tone={
            selectedDelta?.delta == null
              ? 'flat'
              : deltaTone(selectedDelta.delta, meta.better) === 'bad'
                ? 'bad'
                : 'good'
          }
          unit={meta.unit(units, lengths) === '%' ? '%' : ''}
          decimals={meta.decimals}
          height={120}
        />
      </div>

      {caliperPoints.length > 0 && (
        <>
          <div className="section-label">Calipers</div>
          <div className="card">
            <div className="row between">
              <strong className="small">7-site sum</strong>
              <span className="small">
                {caliperPoints[caliperPoints.length - 1].value} mm
                {caliperPoints.length > 1 && (
                  <span className="faint">
                    {' '}
                    (was {caliperPoints[0].value} mm)
                  </span>
                )}
              </span>
            </div>
            <TrendChart
              points={caliperPoints}
              ariaLabel="Caliper 7-site sum"
              tone="good"
              unit="mm"
              decimals={0}
            />
            {latest && caliperSum(latest.calipers) != null && (
              <div className="sitegrid">
                {CALIPER_SITES.map(({ key, label }) => (
                  <div key={key} className="site">
                    <span className="tiny faint">{label}</span>
                    <strong className="small">
                      {latest.calipers[key] == null ? '—' : `${latest.calipers[key]}`}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {dexaEntry?.dexa && (
        <>
          <div className="section-label">DEXA</div>
          <div className="card">
            <div className="small muted" style={{ marginBottom: 10 }}>
              {longDate(dexaEntry.at)}
              {priorDexa ? ` · compared with ${longDate(priorDexa.at)}` : ' · first scan'}
            </div>
            <div className="tilegrid">
              {(
                [
                  ['totalFatPct', 'Total fat', '%', 'down'],
                  ['leanMassLb', 'Lean mass', units, 'up'],
                  ['fatMassLb', 'Fat mass', units, 'down'],
                  ['visceralFatLb', 'Visceral', units, 'down'],
                  ['trunkFatPct', 'Trunk fat', '%', 'down'],
                  ['armsLeanLb', 'Arms lean', units, 'up'],
                  ['legsLeanLb', 'Legs lean', units, 'up'],
                ] as const
              ).map(([key, label, unit, better]) => {
                const value = dexaEntry.dexa?.[key] ?? null;
                if (value == null) return null;
                const prior = priorDexa?.dexa?.[key] ?? null;
                const delta = prior == null ? null : value - prior;
                return (
                  <BigTile
                    key={key}
                    label={label}
                    value={formatValue(value, 1)}
                    delta={delta == null ? undefined : formatDelta(delta, 1)}
                    deltaTone={deltaTone(delta, better)}
                    sub={unit}
                  />
                );
              })}
            </div>
            {dexaEntry.note && (
              <div className="lastperf" style={{ marginTop: 10 }}>
                {dexaEntry.note}
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-label">Log ({entries.length})</div>
      <div className="card">
        {entries.map((m) => (
          <div key={m.id} className="metricrow">
            <div className="grow">
              <div className="small">
                <strong>{longDate(m.at)}</strong>{' '}
                <span className="tiny faint">({relativeDay(m.at)})</span>
              </div>
              <div className="tiny muted">
                {filledFields(m)
                  .map((f) => `${f.short} ${formatValue(m[f.field], f.decimals)}`)
                  .join(' · ') || 'No values'}
              </div>
              <div className="tiny faint">
                {m.loggedByName}
                {caliperSum(m.calipers) != null ? ` · calipers ${caliperSum(m.calipers)}mm` : ''}
                {m.dexa ? ' · DEXA' : ''}
                {m.note ? ` · ${m.note}` : ''}
              </div>
            </div>
            {isTrainer && (
              <button
                className="btn sm danger"
                aria-label={`Delete ${longDate(m.at)} measurement`}
                onClick={() => deleteBodyMetric(m.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="tiny faint" style={{ marginBottom: 20 }}>
        Girths in {lengths}, weight in {units}, calipers in mm. Changing units relabels new entries;
        it does not rewrite history.
      </div>

      <BodyMetricSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
