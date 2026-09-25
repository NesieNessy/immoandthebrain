import { Icons } from '@/components/ui';

/**
 * Autosave state for a Detailbewertung step's header: saving, unsaved or
 * saved. `isDirty` and `isSaving` are deliberately separate — a save can be
 * in flight for an *earlier* edit while a *newer* one is already waiting
 * behind it, in which case both are true at once and "Wird gespeichert…" is
 * still the more honest thing to show.
 */
export function SaveStatusIndicator({ isSaving, isDirty }: { isSaving: boolean; isDirty: boolean }) {
  if (isSaving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icons.Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Wird gespeichert…
      </span>
    );
  }
  if (isDirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning" role="status">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        Nicht gespeicherte Änderungen
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icons.Check size={14} aria-hidden="true" />
      Gespeichert
    </span>
  );
}
