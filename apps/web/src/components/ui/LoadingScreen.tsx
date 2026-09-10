import { LogoMark } from "@/components/common/LogoMark";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  /** Set to null/'' to hide the caption and show only the animated mark. */
  message?: string | null;
  /** Fills the viewport (min-h-screen) — set false to center within a
   *  smaller container instead (e.g. a card or modal body). */
  fullScreen?: boolean;
  className?: string;
}

/** The app-wide loading state — the ImmoAndTheBrain mark's three glyphs (i, n, b)
 *  revealing in sequence, looping, in place of a generic spinner or
 *  "Wird geladen…" text. */
export function LoadingScreen({ message = "Wird geladen…", fullScreen = true, className }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        fullScreen ? "min-h-screen bg-background" : "py-16",
        className
      )}
    >
      <LogoMark size={48} animated />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
