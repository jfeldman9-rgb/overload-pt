interface SparklineProps {
  values: number[];
  ariaLabel: string;
}

/** Bar sparkline sized for a phone card — enough to read a trend, no more. */
export function Sparkline({ values, ariaLabel }: SparklineProps) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const shown = values.slice(-14);

  return (
    <div className="spark" role="img" aria-label={ariaLabel}>
      {shown.map((v, i) => (
        <div
          key={i}
          className={`spark-bar${i === shown.length - 1 ? '' : ' dim'}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
