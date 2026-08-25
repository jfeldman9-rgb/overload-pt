interface NumberFieldProps {
  value: number;
  step: number;
  min?: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  decimals?: boolean;
}

/**
 * Stepper-flanked numeric input. The steppers exist because typing precise
 * numbers mid-set on a phone is the main friction point in logging apps.
 */
export function NumberField({
  value,
  step,
  min = 0,
  onChange,
  ariaLabel,
  decimals = false,
}: NumberFieldProps) {
  const bump = (delta: number) => {
    const next = Math.max(min, Math.round((value + delta) * 100) / 100);
    onChange(next);
    navigator.vibrate?.(8);
  };

  return (
    <div className="numfield">
      <button className="step" onClick={() => bump(-step)} aria-label={`Decrease ${ariaLabel}`}>
        −
      </button>
      <input
        type="number"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        step={step}
        aria-label={ariaLabel}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isFinite(parsed) ? Math.max(min, parsed) : 0);
        }}
      />
      <button className="step" onClick={() => bump(step)} aria-label={`Increase ${ariaLabel}`}>
        +
      </button>
    </div>
  );
}
