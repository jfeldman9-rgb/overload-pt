import type { BodyMetric, BodyMetricField, CaliperSites, LengthUnits, Units } from '../types';

/** Which direction counts as progress, for colouring a delta. */
export type Direction = 'up' | 'down' | 'neutral';

export interface MetricMeta {
  field: BodyMetricField;
  label: string;
  short: string;
  better: Direction;
  decimals: number;
  /** Units resolved against the user's settings. */
  unit: (units: Units, lengthUnits: LengthUnits) => string;
}

export const METRIC_META: MetricMeta[] = [
  {
    field: 'bodyweight',
    label: 'Bodyweight',
    short: 'Weight',
    better: 'neutral',
    decimals: 1,
    unit: (u) => u,
  },
  {
    field: 'bodyFatPct',
    label: 'Body fat',
    short: 'BF%',
    better: 'down',
    decimals: 1,
    unit: () => '%',
  },
  {
    field: 'waist',
    label: 'Waist',
    short: 'Waist',
    better: 'down',
    decimals: 1,
    unit: (_u, l) => l,
  },
  { field: 'hip', label: 'Hip', short: 'Hip', better: 'down', decimals: 1, unit: (_u, l) => l },
  {
    field: 'thigh',
    label: 'Thigh girth',
    short: 'Thigh',
    better: 'up',
    decimals: 1,
    unit: (_u, l) => l,
  },
  { field: 'arm', label: 'Arm girth', short: 'Arm', better: 'up', decimals: 1, unit: (_u, l) => l },
  {
    field: 'restingHr',
    label: 'Resting HR',
    short: 'RHR',
    better: 'down',
    decimals: 0,
    unit: () => 'bpm',
  },
  {
    field: 'vo2max',
    label: 'VO₂ max',
    short: 'VO₂',
    better: 'up',
    decimals: 1,
    unit: () => 'ml/kg/min',
  },
];

export function metaFor(field: BodyMetricField): MetricMeta {
  return METRIC_META.find((m) => m.field === field) ?? METRIC_META[0];
}

export const CALIPER_SITES: Array<{ key: keyof CaliperSites; label: string }> = [
  { key: 'chest', label: 'Chest' },
  { key: 'abdominal', label: 'Abdominal' },
  { key: 'thigh', label: 'Thigh' },
  { key: 'suprailiac', label: 'Suprailiac' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'subscapular', label: 'Subscapular' },
  { key: 'midaxillary', label: 'Midaxillary' },
];

export interface MetricPoint {
  at: string;
  value: number;
}

export function sortedMetrics(metrics: BodyMetric[]): BodyMetric[] {
  return [...metrics].sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function metricSeries(metrics: BodyMetric[], field: BodyMetricField): MetricPoint[] {
  return sortedMetrics(metrics).flatMap((m) => {
    const value = m[field];
    return typeof value === 'number' ? [{ at: m.at, value }] : [];
  });
}

export function latestPoint(metrics: BodyMetric[], field: BodyMetricField): MetricPoint | null {
  const series = metricSeries(metrics, field);
  return series.length ? series[series.length - 1] : null;
}

export interface MetricDelta {
  latest: MetricPoint;
  previous: MetricPoint | null;
  delta: number | null;
  pct: number | null;
  /** Days between the two points being compared. */
  spanDays: number | null;
}

/**
 * Compare the latest reading to the newest reading at least `minDays` older.
 * A trainer reads "since last week", not "since the previous row", so gaps in
 * logging do not turn into a meaningless delta.
 */
export function metricDelta(
  metrics: BodyMetric[],
  field: BodyMetricField,
  minDays = 6,
): MetricDelta | null {
  const series = metricSeries(metrics, field);
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const latestTime = new Date(latest.at).getTime();

  let previous: MetricPoint | null = null;
  for (let i = series.length - 2; i >= 0; i--) {
    const gapDays = (latestTime - new Date(series[i].at).getTime()) / 86_400_000;
    if (gapDays >= minDays) {
      previous = series[i];
      break;
    }
  }
  if (!previous && series.length > 1) previous = series[series.length - 2];
  if (!previous) return { latest, previous: null, delta: null, pct: null, spanDays: null };

  const delta = latest.value - previous.value;
  return {
    latest,
    previous,
    delta,
    pct: previous.value ? (delta / previous.value) * 100 : null,
    spanDays: Math.round((latestTime - new Date(previous.at).getTime()) / 86_400_000),
  };
}

/** 'good' | 'bad' | 'flat' for a delta, given which way progress runs. */
export function deltaTone(delta: number | null, better: Direction): 'good' | 'bad' | 'flat' {
  if (delta == null || Math.abs(delta) < 0.05 || better === 'neutral') return 'flat';
  const improving = better === 'up' ? delta > 0 : delta < 0;
  return improving ? 'good' : 'bad';
}

export function formatDelta(delta: number | null, decimals: number): string {
  if (delta == null) return '—';
  const rounded = Number(delta.toFixed(decimals));
  if (rounded === 0) return '±0';
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

export function formatValue(value: number | null, decimals: number): string {
  if (value == null) return '—';
  return value.toFixed(decimals).replace(/\.0$/, '');
}

export function caliperSum(calipers: CaliperSites): number | null {
  const values = CALIPER_SITES.map(({ key }) => calipers[key]).filter(
    (v): v is number => typeof v === 'number',
  );
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

export function hasCalipers(metric: BodyMetric): boolean {
  return caliperSum(metric.calipers) != null;
}

export function emptyCalipers(): CaliperSites {
  return {
    chest: null,
    abdominal: null,
    thigh: null,
    suprailiac: null,
    triceps: null,
    subscapular: null,
    midaxillary: null,
  };
}

/** Fields actually present on an entry, for a one-line summary. */
export function filledFields(metric: BodyMetric): MetricMeta[] {
  return METRIC_META.filter((m) => typeof metric[m.field] === 'number');
}

/** Most recent entry that carries a DEXA scan. */
export function latestDexa(metrics: BodyMetric[]): BodyMetric | null {
  return sortedMetrics(metrics).filter((m) => m.dexa != null).pop() ?? null;
}
