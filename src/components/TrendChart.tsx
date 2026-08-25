import { useMemo } from 'react';
import { shortDate } from '../lib/format';

export interface TrendPoint {
  at: string;
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  ariaLabel: string;
  /** Colour the line by which direction counts as progress. */
  tone?: 'good' | 'bad' | 'flat' | 'info';
  unit?: string;
  decimals?: number;
  height?: number;
}

const TONE_COLOR: Record<string, string> = {
  good: 'var(--accent)',
  bad: 'var(--danger)',
  flat: 'var(--info)',
  info: 'var(--info)',
};

/**
 * One inline SVG line, min/max rails, and the endpoints labelled. Enough to
 * read a trend on a phone at arm's length; not a charting library.
 */
export function TrendChart({
  points,
  ariaLabel,
  tone = 'info',
  unit = '',
  decimals = 1,
  height = 96,
}: TrendChartProps) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(1, Math.abs(max) * 0.1);
    const pad = span * 0.15;
    const lo = min - pad;
    const hi = max + pad;

    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 40 - ((p.value - lo) / (hi - lo)) * 40;
      return { x, y, value: p.value, at: p.at };
    });

    return {
      min,
      max,
      line: coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '),
      area: `0,40 ${coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')} 100,40`,
      last: coords[coords.length - 1],
      coords,
    };
  }, [points]);

  if (!geometry) {
    return (
      <div className="chart-empty">
        {points.length === 1
          ? 'One reading so far — log another to see the trend.'
          : 'No readings yet.'}
      </div>
    );
  }

  const color = TONE_COLOR[tone] ?? TONE_COLOR.info;
  const fmt = (v: number) => `${Number(v.toFixed(decimals))}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="chart">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`${ariaLabel}. ${points.length} readings from ${fmt(points[0].value)} to ${fmt(
          geometry.last.value,
        )}.`}
      >
        <polygon points={geometry.area} fill={color} opacity="0.12" />
        <polyline
          points={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {geometry.coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === geometry.coords.length - 1 ? 2.6 : 1.3}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="chart-axis">
        <span>
          {shortDate(points[0].at)} · {fmt(points[0].value)}
        </span>
        <span className="chart-range">
          {fmt(geometry.min)} – {fmt(geometry.max)}
        </span>
        <span>
          {shortDate(geometry.last.at)} · <strong>{fmt(geometry.last.value)}</strong>
        </span>
      </div>
    </div>
  );
}
