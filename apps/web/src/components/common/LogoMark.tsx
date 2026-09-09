import { cn } from "@/lib/utils";

interface LogoMarkProps {
  /** string | number to match lucide's icon prop signature — the iconMap
   *  it's swapped into alongside those icons needs one shared component type. */
  size?: number | string;
  className?: string;
  /** 'brand' (default) shows the logo's own baked-in blue/gold colors.
   *  'currentColor' instead renders a solid silhouette — masked from the
   *  same artwork — filled with the current text color, so it can be
   *  recolored via a `text-*` class (e.g. for an error/not-found state). */
  tone?: "brand" | "currentColor";
  /** Reveals the three glyph groups (i / n / b) in sequence, looping —
   *  used for the loading state. Requires inline SVG (the static-file img
   *  can't be targeted per-part), so only supported with tone="brand". */
  animated?: boolean;
}

const LOGO_SRC = "/logo-mark.svg";
const ASPECT_RATIO = 1688 / 1024;
const VIEW_BOX = "8 8 422 256";

/** The ImmoAndTheBrain monogram (source of truth: public/logo-mark.svg). */
export function LogoMark({ size = 24, className, tone = "brand", animated = false }: LogoMarkProps) {
  const numericSize = typeof size === "number" ? size : parseFloat(size) || 24;
  const width = numericSize * ASPECT_RATIO;

  if (tone === "currentColor") {
    return (
      <span
        role="img"
        aria-label="ImmoAndTheBrain"
        className={cn("inline-block shrink-0 bg-current", className)}
        style={{
          width,
          height: numericSize,
          WebkitMaskImage: `url(${LOGO_SRC})`,
          maskImage: `url(${LOGO_SRC})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    );
  }

  if (animated) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={numericSize}
        viewBox={VIEW_BOX}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="ImmoAndTheBrain"
        className={className}
      >
        <g className="logo-reveal-i">
          <rect x="22" y="90" width="36" height="161" fill="#224b96" />
          <circle cx="40" cy="45" r="20" fill="#224b96" />
        </g>
        <g className="logo-reveal-n">
          <path
            d="M93 251V165C93 120 119 92 153 92S214 120 214 165V251"
            fill="none"
            stroke="#daaa64"
            strokeWidth="35"
            strokeLinecap="butt"
            strokeLinejoin="round"
          />
        </g>
        <g className="logo-reveal-b">
          <rect x="249.5" y="21" width="35" height="148" fill="#224b96" />
          <path
            fill="#224b96"
            fillRule="evenodd"
            d="M333 85.5 A83.5 83.5 0 1 1 332.999 252.5 A83.5 83.5 0 1 1 333 85.5 Z M333 120.5 A48.5 48.5 0 1 0 333.001 217.5 A48.5 48.5 0 1 0 333 120.5 Z"
          />
        </g>
      </svg>
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="ImmoAndTheBrain"
      width={width}
      height={numericSize}
      className={className}
    />
  );
}
