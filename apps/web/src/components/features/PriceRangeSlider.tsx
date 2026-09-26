"use client";

import { TextField } from '@/components/ui';
import { formatDecimalInput, parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import { useState } from 'react';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  /** Fired when a drag ends — for callers that persist once, not per step. */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  format: (value: number) => string;
  /** Explains where the chosen value goes, shown under it. */
  hint?: string;
}

/**
 * "Mit welchem Preis möchtest du weiterrechnen?" — picks one amount within an
 * indicated price range: the range's ends on either side of the slider, the
 * chosen amount centred underneath. The amount can also be typed in; it is
 * kept within the range, same as the slider.
 */
export function PriceRangeSlider({ min, max, value, onChange, onCommit, disabled, format, hint }: PriceRangeSliderProps) {
  const upper = Math.max(min, max);
  const clamp = (amount: number) => Math.max(min, Math.min(upper, amount));
  const clamped = clamp(value);
  const isDisabled = disabled || upper <= min;
  /** Raw text while the amount field is being typed in; null otherwise. */
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === '') return;
    const parsed = parseDecimalInput(draft);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">{format(min)}</span>
        <input
          type="range"
          min={min}
          max={upper}
          step="100"
          value={clamped}
          disabled={isDisabled}
          onChange={(event) => onChange(Number(event.target.value))}
          onMouseUp={() => onCommit?.(clamped)}
          onTouchEnd={() => onCommit?.(clamped)}
          onKeyUp={() => onCommit?.(clamped)}
          aria-label="Preis für weitere Berechnung"
          aria-valuetext={format(clamped)}
          className="min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">{format(upper)}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="text-lg font-semibold text-primary">Ausgewählt:</span>
        <div className="w-40">
          <TextField
            inputMode="decimal"
            suffix="€"
            aria-label="Ausgewählter Preis"
            title={`Zwischen ${format(min)} und ${format(upper)}`}
            disabled={isDisabled}
            value={draft ?? formatDecimalInput(String(clamped))}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              // Discards the typed value (no blur — that would commit it).
              if (event.key === 'Escape') setDraft(null);
            }}
            className="text-right text-lg font-semibold text-primary"
          />
        </div>
      </div>
      {hint && <p className="mt-0.5 text-center text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
