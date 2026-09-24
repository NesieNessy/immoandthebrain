/**
 * Purchase price factor = purchase price / (cold rent × 12), rounded to 1 decimal place.
 * Returns null when either input is ≤ 0.
 */
export function calcKpf(purchasePrice: number, coldRent: number): number | null {
  if (purchasePrice <= 0 || coldRent <= 0) return null;
  return Math.round((purchasePrice / (coldRent * 12)) * 10) / 10;
}

/**
 * Where does `kpf` sit within [minValue, maxValue] as a percentage 0–100?
 * Clamped so it never goes below 0 or above 100.
 */
export function calcPositionPct(
  kpf: number,
  minValue: number,
  maxValue: number
): number {
  if (maxValue <= minValue) return 50;
  const pct = ((kpf - minValue) / (maxValue - minValue)) * 100;
  return Math.min(100, Math.max(0, pct));
}

// ── Fixed KPF classification ─────────────────────────────────────────────────
// Replaces the old per-postal-code kpf_ranges table with a static market-knowledge
// scale (KPF is inverse gross yield): >25 pricey regions, 20-25 mid-size cities, <20 rural.

/** Fixed display scale for the KPF gauge — left = green/cheap, right = red/expensive. */
export const KPF_SCALE_MIN = 15;
export const KPF_SCALE_MAX = 30;

export interface KpfClassification {
  label:       string;
  description: string;
}

/** Classifies a KPF value using the fixed market-knowledge bands. */
export function classifyKpf(kpf: number): KpfClassification {
  if (kpf < 20) {
    return {
      label: 'Günstig',
      description: `Der Faktor von ${kpf.toFixed(1)} ist günstig und deutet auf eine hohe Rendite hin – ` +
        `oft in ländlichen Lagen oder mit erhöhtem Risiko verbunden.`,
    };
  }
  if (kpf < 25) {
    return {
      label: 'Solide',
      description: `Der Faktor von ${kpf.toFixed(1)} liegt in der soliden, typischen Bandbreite für Mittelstädte.`,
    };
  }
  if (kpf < 30) {
    return {
      label: 'Hochpreisig',
      description: `Der Faktor von ${kpf.toFixed(1)} ist typisch für einen hochpreisigen Markt (z. B. München, Hamburg).`,
    };
  }
  return {
    label: 'Sehr teuer',
    description: `Der Faktor von ${kpf.toFixed(1)} ist sehr hoch und meist mit einer geringen Mietrendite verbunden.`,
  };
}
