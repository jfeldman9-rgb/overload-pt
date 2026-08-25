import type { ReactNode } from 'react';

interface BigTileProps {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'flat';
  /** e.g. "vs 7 days ago" */
  sub?: string;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * The number first, the change second, everything else small. Sized so three
 * fit across a phone and a trainer can read the row without stopping.
 */
export function BigTile({
  label,
  value,
  unit,
  delta,
  deltaTone = 'flat',
  sub,
  onClick,
  children,
}: BigTileProps) {
  const body = (
    <>
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      {delta && <div className={`tile-delta ${deltaTone}`}>{delta}</div>}
      {sub && <div className="tile-sub">{sub}</div>}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button className="tile" onClick={onClick} aria-label={`${label} ${value}${unit ?? ''}`}>
        {body}
      </button>
    );
  }
  return <div className="tile">{body}</div>;
}
