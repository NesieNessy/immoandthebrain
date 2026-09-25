"use client";

import { Icons } from '@/components/ui';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  /** Fired when a drag ends — for callers that persist once, not per step. */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  format: (value: number) => string;
  /** Explains where the chosen value goes, shown next to it. */
  hint?: string;
}

/** The fixed ends of the range — read-only, hence the lock. */
function BoundBox({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {caption}
        <Icons.Lock className="h-3 w-3" aria-hidden="true" />
      </p>
    </div>
  );
}

/**
 * "Mit welchem Preis möchtest du weiterrechnen?" — picks one amount within an
 * indicated price range, between locked Minimum/Maximum boxes.
 */
export function PriceRangeSlider({ min, max, value, onChange, onCommit, disabled, format, hint }: PriceRangeSliderProps) {
  const upper = Math.max(min, max);
  const clamped = Math.max(min, Math.min(upper, value));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[120px_1fr_120px]">
        <div className="order-1"><BoundBox value={format(min)} caption="Minimum" /></div>
        <input
          type="range"
          min={min}
          max={upper}
          step="100"
          value={clamped}
          disabled={disabled || upper <= min}
          onChange={(event) => onChange(Number(event.target.value))}
          onMouseUp={() => onCommit?.(clamped)}
          onTouchEnd={() => onCommit?.(clamped)}
          onKeyUp={() => onCommit?.(clamped)}
          aria-label="Preis für weitere Berechnung"
          className="order-3 col-span-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed sm:order-2 sm:col-span-1"
        />
        <div className="order-2 sm:order-3"><BoundBox value={format(upper)} caption="Maximum" /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
          <Icons.Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium text-foreground">Ausgewählt:</span>
          <span className="font-semibold text-primary">{format(clamped)}</span>
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
