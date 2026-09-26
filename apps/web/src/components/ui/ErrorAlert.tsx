import { Icons } from "@/components/common";
import { cn } from "@/lib/utils";

interface ErrorAlertProps {
  message: string;
  /** Optional bold first line, e.g. "Speichern fehlgeschlagen". */
  title?: string;
  /** Adds "Erneut versuchen" — for a failed load, where retrying is the fix. */
  onRetry?: () => void;
  /** Adds a close button. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Page- or form-level error: something the page itself needs (loading its
 * data, saving the step) failed. Shown at the top of the content, above the
 * form. For a single field use that field's `error` prop; for a failed
 * background action (a toggle, a delete in a list) use a toast — see
 * docs/error-handling.md.
 */
export function ErrorAlert({ message, title, onRetry, onDismiss, className }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      <Icons.AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <p className="whitespace-pre-line break-words">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-2 hover:no-underline"
          >
            <Icons.RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Erneut versuchen
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fehlermeldung schließen"
          className="shrink-0 cursor-pointer rounded p-0.5 opacity-70 hover:bg-destructive/10 hover:opacity-100"
        >
          <Icons.X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
