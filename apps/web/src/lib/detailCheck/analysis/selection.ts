import { runRentCalculator, type CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { equityIrr, planRoi } from './metrics';
import { runOptimization } from './optimize';

/**
 * Auswahl-Optimierung (SCRUM-96, Schnitt 4): welche geplanten Maßnahmen
 * lohnen sich, gemessen an ROI oder EK-Rendite? Anders als die
 * Zeitpunkt-Optimierer in objectives.ts sucht dieser Optimierer über
 * Teilmengen der geplanten Maßnahmen (Ausschluss), nicht über deren
 * Zeitpunkt allein — die Zeitpunkte werden in Stufe 2 je Kandidat noch
 * feinoptimiert (EARLIEST_BREAK_EVEN).
 */
export type SelectionGoal = 'MAX_ROI' | 'MAX_EQUITY_IRR';

/** Teilmengen-Suche nur bis zu dieser Anzahl geplanter Maßnahmen (2^10 = 1024 Läufe). */
export const MAX_SELECTION_MEASURES = 10;

export type SelectionResult =
  | { excludedModernizationIds: string[]; placements: Record<string, string>; score: number }
  | { tooMany: true }
  | null;

type Result = ReturnType<typeof runRentCalculator>;

function scoreFor(goal: SelectionGoal, result: Result, withoutAny: Result, viewPeriodYears: number): number {
  const value = goal === 'MAX_ROI' ? planRoi(result, withoutAny, viewPeriodYears) : equityIrr(result, viewPeriodYears);
  return value == null ? -Infinity : value;
}

/** Every non-empty subset of `ids`, as Sets; `includeEmpty` also yields the empty set. */
function subsetsOf(ids: string[], includeEmpty: boolean): Set<string>[] {
  const subsets: Set<string>[] = [];
  const total = 1 << ids.length;
  for (let mask = includeEmpty ? 0 : 1; mask < total; mask += 1) {
    subsets.push(new Set(ids.filter((_, index) => (mask & (1 << index)) !== 0)));
  }
  return subsets;
}

function runWithExclusion(params: CalculatorParams, cases: RenovationCase[], excludedModernizationIds: string[]): Result {
  return runRentCalculator(
    { ...params, placementMode: 'DEFAULT', modernizationPlacements: undefined, rentIncreasePlan: undefined, rentIncreaseOverrides: undefined, excludedModernizationIds },
    cases,
  );
}

function breakEvenOffset(result: Result, start: string): number {
  if (!result.breakEven) return 9999;
  const [sy, sm] = start.split('-').map(Number);
  const [y, m] = result.breakEven.split('-').map(Number);
  return (y - sy) * 12 + (m - sm);
}

export function optimizeSelection(params: CalculatorParams, cases: RenovationCase[], goal: SelectionGoal): SelectionResult {
  const baseExcluded = params.excludedModernizationIds ?? [];
  const baseExcludedSet = new Set(baseExcluded);
  const planned = cases.filter((item) => item.selected && Boolean(item.ai) && !baseExcludedSet.has(item.id)).map((item) => item.id);
  if (planned.length > MAX_SELECTION_MEASURES) return { tooMany: true };
  if (planned.length === 0) return null;

  const withoutAny = runWithExclusion(params, cases, [...baseExcluded, ...planned]);
  const includeEmpty = goal === 'MAX_EQUITY_IRR';
  const subsets = subsetsOf(planned, includeEmpty);

  const stage1 = subsets.map((keep) => {
    const excludedModernizationIds = [...baseExcluded, ...planned.filter((id) => !keep.has(id))];
    const result = runWithExclusion(params, cases, excludedModernizationIds);
    return { keep, excludedModernizationIds, score: scoreFor(goal, result, withoutAny, params.viewPeriodYears ?? 15) };
  });
  stage1.sort((a, b) => b.score - a.score);
  const top3 = stage1.slice(0, 3);

  type Candidate = { excludedModernizationIds: string[]; placements: Record<string, string>; score: number; breakEvenOffset: number };
  const viewPeriodYears = params.viewPeriodYears ?? 15;
  const candidates: Candidate[] = top3.map((candidate) => {
    if (candidate.keep.size === 0) {
      const result = withoutAny;
      return { excludedModernizationIds: candidate.excludedModernizationIds, placements: {}, score: candidate.score, breakEvenOffset: breakEvenOffset(result, params.startYyyymm) };
    }
    const paramsExcl = { ...params, excludedModernizationIds: candidate.excludedModernizationIds };
    const proposal = runOptimization(paramsExcl, cases, 'EARLIEST_BREAK_EVEN');
    if (!proposal) {
      const result = runWithExclusion(params, cases, candidate.excludedModernizationIds);
      return { excludedModernizationIds: candidate.excludedModernizationIds, placements: {}, score: candidate.score, breakEvenOffset: breakEvenOffset(result, params.startYyyymm) };
    }
    const replay = runRentCalculator(
      { ...paramsExcl, placementMode: 'DEFAULT', modernizationPlacements: proposal.placements, rentIncreaseOverrides: undefined, rentIncreasePlan: undefined },
      cases,
    );
    const score = scoreFor(goal, replay, withoutAny, viewPeriodYears);
    return { excludedModernizationIds: candidate.excludedModernizationIds, placements: proposal.placements, score, breakEvenOffset: breakEvenOffset(replay, params.startYyyymm) };
  });

  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (candidate.score - best.score > 1e-9) {
      best = candidate;
    } else if (Math.abs(candidate.score - best.score) < 1e-9 && candidate.breakEvenOffset < best.breakEvenOffset) {
      best = candidate;
    }
  }

  return { excludedModernizationIds: best.excludedModernizationIds.filter((id) => planned.includes(id)), placements: best.placements, score: best.score };
}
