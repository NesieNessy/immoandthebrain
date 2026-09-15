import { roundCurrency } from './acquisitionCosts';

export type DepreciationMode = 'STANDARD' | 'INDIVIDUAL';
export type PriceSplitMode = 'STANDARD' | 'INDIVIDUAL';

export const MODERNIZATION_OPTIONS = [
  { value: '', label: 'Bitte wählen...' },
  { value: '0_5', label: '0-5 Jahre' },
  { value: '5_10', label: '5-10 Jahre' },
  { value: '10_15', label: '10-15 Jahre' },
  { value: '15_20', label: '15-20 Jahre' },
  { value: 'GT_20', label: '> 20 Jahre' },
];

export const MODERNIZATION_FIELDS = [
  ['modernizationRoof', 'Dacherneuerung inkl. Dämmung'],
  ['modernizationWindows', 'Fenster & Außentüren'],
  ['modernizationLines', 'Leitungssysteme (Strom, etc.)'],
  ['modernizationHeating', 'Heizungsanlage'],
  ['modernizationFacade', 'Dämmung Außenwände'],
  ['modernizationBathrooms', 'Bäder'],
  ['modernizationInterior', 'Innenausbau (exkl. Bäder)'],
] as const;

export type ModernizationField = typeof MODERNIZATION_FIELDS[number][0];
export type ModernizationSelections = Record<ModernizationField, string>;

const MODERNIZATION_POINTS: Record<string, number> = {
  '0_5': 3,
  '5_10': 2,
  '10_15': 1.5,
  '15_20': 1,
  GT_20: 0,
};

const COEFFICIENTS: Record<number, { a: number; b: number; c: number }> = {
  0: { a: 1.25, b: 2.625, c: 1.525 },
  1: { a: 1.25, b: 2.625, c: 1.525 },
  2: { a: 1.0767, b: 2.2757, c: 1.3878 },
  3: { a: 0.9033, b: 1.9263, c: 1.2505 },
  4: { a: 0.73, b: 1.577, c: 1.1133 },
  5: { a: 0.6725, b: 1.4578, c: 1.085 },
  6: { a: 0.615, b: 1.3385, c: 1.0567 },
  7: { a: 0.558, b: 1.2193, c: 1.0283 },
  8: { a: 0.5, b: 1.1, c: 1 },
  9: { a: 0.466, b: 1.027, c: 0.9906 },
  10: { a: 0.432, b: 0.954, c: 0.9811 },
  11: { a: 0.398, b: 0.881, c: 0.9717 },
  12: { a: 0.364, b: 0.808, c: 0.9622 },
  13: { a: 0.33, b: 0.735, c: 0.9528 },
  14: { a: 0.304, b: 0.676, c: 0.9506 },
  15: { a: 0.278, b: 0.617, c: 0.9485 },
  16: { a: 0.252, b: 0.558, c: 0.9463 },
  17: { a: 0.226, b: 0.499, c: 0.9442 },
  18: { a: 0.2, b: 0.44, c: 0.942 },
  19: { a: 0.2, b: 0.44, c: 0.942 },
  20: { a: 0.2, b: 0.44, c: 0.942 },
  21: { a: 0.2, b: 0.44, c: 0.942 },
};

export function usefulLifeByCategory(category?: string | null): number {
  if (category === 'HOLZBAUWEISE') return 50;
  if (category === 'DENKMALGESCHUETZT') return 100;
  return 80;
}

export function modernizationPoints(selections: ModernizationSelections): number {
  return roundCurrency(
    Object.values(selections).reduce((sum, value) => sum + (MODERNIZATION_POINTS[value] ?? 0), 0),
  );
}

export function computeRemainingUsefulLife(args: {
  category?: string | null;
  yearOfConstruction: number;
  selections: ModernizationSelections;
  currentYear?: number;
}) {
  const gnd = usefulLifeByCategory(args.category);
  const age = Math.max(0, (args.currentYear ?? new Date().getFullYear()) - args.yearOfConstruction);
  const points = modernizationPoints(args.selections);
  const roundedPoints = Math.max(0, Math.min(21, Math.round(points)));
  const coeff = COEFFICIENTS[roundedPoints] ?? COEFFICIENTS[0];
  const rawRnd = coeff.a * ((age * age) / gnd) - coeff.b * age + coeff.c * gnd;
  const rnd = Math.max(1, Math.min(gnd, roundCurrency(rawRnd)));

  return {
    gnd,
    age,
    modernizationPoints: points,
    remainingUsefulLifeYears: rnd,
    afaPercent: roundCurrency(100 / rnd),
  };
}

export function computePriceSplitStandard(purchasePrice: number, buildingSharePercent = 65) {
  const buildingValue = roundCurrency(purchasePrice * (buildingSharePercent / 100));
  const landValue = roundCurrency(Math.max(0, purchasePrice - buildingValue));
  const landSharePercent = roundCurrency(100 - buildingSharePercent);
  return { buildingValue, buildingSharePercent, landValue, landSharePercent };
}

export function computePriceSplitIndividual(args: {
  purchasePrice: number;
  landReferenceValue: number;
  plotAreaM2: number;
  coOwnershipNumerator: number;
  coOwnershipDenominator: number;
}) {
  const share = args.coOwnershipDenominator > 0
    ? args.coOwnershipNumerator / args.coOwnershipDenominator
    : 0;
  const rawLandValue = Math.max(0, args.landReferenceValue * args.plotAreaM2 * share);
  // Capped to the purchase price (a Bodenrichtwert-based land value can
  // exceed it, e.g. bad input data) so buildingValue/landValue and their
  // percentages always add back up to the full purchase price / 100%,
  // the same guarantee computePriceSplitStandard gets for free from taking
  // buildingSharePercent as its input instead of deriving it.
  const landValue = roundCurrency(Math.min(rawLandValue, Math.max(0, args.purchasePrice)));
  const buildingValue = roundCurrency(Math.max(0, args.purchasePrice - landValue));
  return {
    buildingValue,
    buildingSharePercent: args.purchasePrice > 0 ? roundCurrency((buildingValue / args.purchasePrice) * 100) : 0,
    landValue,
    landSharePercent: args.purchasePrice > 0 ? roundCurrency((landValue / args.purchasePrice) * 100) : 0,
  };
}
