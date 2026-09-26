import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Small line under the value (e.g. "erfasst", "für Kalkulation"). */
  caption?: string;
  valueClassName?: string;
  captionClassName?: string;
}

/** One key figure in an overview row — label, value, optional caption. */
export function StatTile({ label, value, caption, valueClassName, captionClassName }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-2 truncate text-2xl font-semibold text-foreground", valueClassName)}>{value}</p>
      {caption && <p className={cn("mt-0.5 text-xs text-muted-foreground", captionClassName)}>{caption}</p>}
    </div>
  );
}
