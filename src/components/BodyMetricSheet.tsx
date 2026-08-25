import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { Sheet } from './Sheet';
import { CALIPER_SITES, emptyCalipers, sortedMetrics } from '../lib/metrics';
import type { CaliperSites, DexaScan } from '../types';

interface MetricFieldProps {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  step: number;
  onChange: (value: number | null) => void;
}

/** Blank-able number with one-thumb steppers, matching the set grid feel. */
function MetricField({ id, label, unit, value, step, onChange }: MetricFieldProps) {
  const bump = (delta: number) => {
    const base = value ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    onChange(next);
    navigator.vibrate?.(8);
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="faint">{unit}</span>
      </label>
      <div className="numfield">
        <button className="step" onClick={() => bump(-step)} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value ?? ''}
          placeholder="—"
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
        />
        <button className="step" onClick={() => bump(step)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="logsheet-group">
      <button className="logsheet-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="grow">
          <strong className="small">{title}</strong>
          <span className="tiny faint" style={{ display: 'block' }}>
            {hint}
          </span>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="logsheet-fields">{children}</div>}
    </div>
  );
}

function emptyDexa(): DexaScan {
  return {
    totalFatPct: null,
    leanMassLb: null,
    fatMassLb: null,
    visceralFatLb: null,
    trunkFatPct: null,
    armsLeanLb: null,
    legsLeanLb: null,
  };
}

/**
 * A date input can be cleared, and `new Date('T08:00:00')` throws on
 * toISOString. Save used to swallow that and do nothing at all, losing the
 * measurements silently.
 */
function measuredAtIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T08:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function todayLocal(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

export function BodyMetricSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, bodyMetrics, addBodyMetric, actor } = useApp();
  const units = state.settings.units;
  const lengths = state.settings.lengthUnits;

  const [date, setDate] = useState(todayLocal());
  const [bodyweight, setBodyweight] = useState<number | null>(null);
  const [bodyFatPct, setBodyFatPct] = useState<number | null>(null);
  const [waist, setWaist] = useState<number | null>(null);
  const [restingHr, setRestingHr] = useState<number | null>(null);
  const [vo2max, setVo2max] = useState<number | null>(null);
  const [hip, setHip] = useState<number | null>(null);
  const [thigh, setThigh] = useState<number | null>(null);
  const [arm, setArm] = useState<number | null>(null);
  const [calipers, setCalipers] = useState<CaliperSites>(emptyCalipers);
  const [dexa, setDexa] = useState<DexaScan>(emptyDexa);
  const [note, setNote] = useState('');
  const [openGroup, setOpenGroup] = useState<'girths' | 'calipers' | 'dexa' | null>(null);
  const [saved, setSaved] = useState(false);

  const previous = useMemo(() => sortedMetrics(bodyMetrics).pop() ?? null, [bodyMetrics]);

  const anyValue =
    [bodyweight, bodyFatPct, waist, restingHr, vo2max, hip, thigh, arm].some((v) => v != null) ||
    CALIPER_SITES.some(({ key }) => calipers[key] != null) ||
    Object.values(dexa).some((v) => v != null);

  const reset = () => {
    setDate(todayLocal());
    setBodyweight(null);
    setBodyFatPct(null);
    setWaist(null);
    setRestingHr(null);
    setVo2max(null);
    setHip(null);
    setThigh(null);
    setArm(null);
    setCalipers(emptyCalipers());
    setDexa(emptyDexa());
    setNote('');
    setOpenGroup(null);
  };

  const copyLast = () => {
    if (!previous) return;
    setBodyweight(previous.bodyweight);
    setBodyFatPct(previous.bodyFatPct);
    setWaist(previous.waist);
    setRestingHr(previous.restingHr);
    setVo2max(previous.vo2max);
    setHip(previous.hip);
    setThigh(previous.thigh);
    setArm(previous.arm);
  };

  const save = () => {
    const at = measuredAtIso(date);
    if (!anyValue || !at) return;
    addBodyMetric({
      at,
      bodyweight,
      bodyFatPct,
      waist,
      hip,
      thigh,
      arm,
      restingHr,
      vo2max,
      calipers,
      dexa: Object.values(dexa).some((v) => v != null) ? dexa : null,
      note: note.trim(),
    });
    setSaved(true);
    reset();
    setTimeout(() => setSaved(false), 2600);
    onClose();
  };

  return (
    <Sheet open={open} title="Log body metrics" onClose={onClose}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="field grow">
          <label htmlFor="bm-date">Measured on</label>
          <input
            id="bm-date"
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
          />
          {!measuredAtIso(date) && (
            <span className="tiny" style={{ color: 'var(--warn)' }}>
              Pick a date before saving.
            </span>
          )}
        </div>
        {previous && (
          <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={copyLast}>
            Copy last
          </button>
        )}
      </div>

      <div className="fieldgrid">
        <MetricField
          id="bm-weight"
          label="Bodyweight"
          unit={units}
          value={bodyweight}
          step={0.5}
          onChange={setBodyweight}
        />
        <MetricField
          id="bm-bf"
          label="Body fat"
          unit="%"
          value={bodyFatPct}
          step={0.1}
          onChange={setBodyFatPct}
        />
        <MetricField
          id="bm-waist"
          label="Waist"
          unit={lengths}
          value={waist}
          step={0.1}
          onChange={setWaist}
        />
        <MetricField
          id="bm-rhr"
          label="Resting HR"
          unit="bpm"
          value={restingHr}
          step={1}
          onChange={setRestingHr}
        />
        <MetricField
          id="bm-vo2"
          label="VO₂ max"
          unit="ml/kg/min"
          value={vo2max}
          step={0.1}
          onChange={setVo2max}
        />
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        <Group
          title="Girths"
          hint={`Hip, thigh, arm (${lengths})`}
          open={openGroup === 'girths'}
          onToggle={() => setOpenGroup(openGroup === 'girths' ? null : 'girths')}
        >
          <div className="fieldgrid three">
            <MetricField id="bm-hip" label="Hip" unit={lengths} value={hip} step={0.1} onChange={setHip} />
            <MetricField
              id="bm-thigh"
              label="Thigh"
              unit={lengths}
              value={thigh}
              step={0.1}
              onChange={setThigh}
            />
            <MetricField id="bm-arm" label="Arm" unit={lengths} value={arm} step={0.1} onChange={setArm} />
          </div>
        </Group>

        <Group
          title="Calipers"
          hint="7 skinfold sites, mm"
          open={openGroup === 'calipers'}
          onToggle={() => setOpenGroup(openGroup === 'calipers' ? null : 'calipers')}
        >
          <div className="fieldgrid">
            {CALIPER_SITES.map(({ key, label }) => (
              <MetricField
                key={key}
                id={`bm-cal-${key}`}
                label={label}
                unit="mm"
                value={calipers[key]}
                step={1}
                onChange={(v) => setCalipers((c) => ({ ...c, [key]: v }))}
              />
            ))}
          </div>
        </Group>

        <Group
          title="DEXA"
          hint="Total and regional, if you have a scan"
          open={openGroup === 'dexa'}
          onToggle={() => setOpenGroup(openGroup === 'dexa' ? null : 'dexa')}
        >
          <div className="fieldgrid">
            <MetricField
              id="bm-dexa-total"
              label="Total fat"
              unit="%"
              value={dexa.totalFatPct}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, totalFatPct: v }))}
            />
            <MetricField
              id="bm-dexa-lean"
              label="Lean mass"
              unit={units}
              value={dexa.leanMassLb}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, leanMassLb: v }))}
            />
            <MetricField
              id="bm-dexa-fat"
              label="Fat mass"
              unit={units}
              value={dexa.fatMassLb}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, fatMassLb: v }))}
            />
            <MetricField
              id="bm-dexa-visceral"
              label="Visceral fat"
              unit={units}
              value={dexa.visceralFatLb}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, visceralFatLb: v }))}
            />
            <MetricField
              id="bm-dexa-trunk"
              label="Trunk fat"
              unit="%"
              value={dexa.trunkFatPct}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, trunkFatPct: v }))}
            />
            <MetricField
              id="bm-dexa-arms"
              label="Arms lean"
              unit={units}
              value={dexa.armsLeanLb}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, armsLeanLb: v }))}
            />
            <MetricField
              id="bm-dexa-legs"
              label="Legs lean"
              unit={units}
              value={dexa.legsLeanLb}
              step={0.1}
              onChange={(v) => setDexa((d) => ({ ...d, legsLeanLb: v }))}
            />
          </div>
        </Group>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="bm-note">Note (optional)</label>
        <input
          id="bm-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Morning, fasted, post-scan…"
        />
      </div>

      <div className="tiny faint" style={{ margin: '10px 0' }}>
        Logging as {actor.name}. Blank fields are skipped, so a single number is a valid entry.
      </div>

      <button
        className="btn primary block"
        onClick={save}
        disabled={!anyValue || !measuredAtIso(date)}
      >
        Save measurements
      </button>
      {saved && (
        <div className="tiny" style={{ marginTop: 8, color: 'var(--accent)' }}>
          Saved.
        </div>
      )}
    </Sheet>
  );
}
