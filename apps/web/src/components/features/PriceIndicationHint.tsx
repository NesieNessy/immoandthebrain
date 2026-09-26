import { Icons } from '@/components/ui';
import { formatEuro } from '@/lib/utils';

/**
 * Live "KI-Preisindikation" for the measure being entered — shown in the
 * add/edit form as soon as a Kategorie and Maßnahme are chosen, before the
 * measure is even saved.
 */
export function PriceIndicationHint({ range }: { range: { min: number; max: number } }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Icons.Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        KI-Preisindikation
      </p>
      <p className="mt-1 text-base font-semibold text-primary">
        {formatEuro(range.min)} – {formatEuro(range.max)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Schätzung basierend auf Maßnahme, Wohnfläche und Postleitzahl</p>
    </div>
  );
}
