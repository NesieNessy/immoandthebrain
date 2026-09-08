import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Variant map — semantic color pairs (bg / text)
// ---------------------------------------------------------------------------

export type TagVariant =
  | "default"
  | "muted"
  | "primary"
  | "gold"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "violet"
  | "orange"
  | "teal";

const variantStyles: Record<TagVariant, string> = {
  default:  "bg-foreground/10 text-foreground",
  muted:    "bg-muted text-muted-foreground",
  primary:  "bg-primary/15 text-primary",
  gold:     "bg-accent/15 text-accent-text",
  success:  "bg-success/15 text-success",
  warning:  "bg-warning/15 text-warning",
  danger:   "bg-destructive/15 text-destructive",
  info:     "bg-info/15 text-info",
  purple:   "bg-accent-violet/15 text-accent-violet",
  violet:   "bg-accent-violet/15 text-accent-violet",
  orange:   "bg-accent-terracotta/15 text-accent-terracotta",
  teal:     "bg-secondary/15 text-secondary",
};

export type TagSize = "sm" | "md";

const sizeStyles: Record<TagSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TagProps {
  label: string;
  variant?: TagVariant;
  size?: TagSize;
  /** Adds a small leading dot in the tag's own color — for status pills. */
  dot?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Tag({ label, variant = "default", size = "sm", dot, className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {label}
    </span>
  );
}
