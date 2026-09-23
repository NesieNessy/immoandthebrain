import { DEFAULT_VIEW_PERIOD_YEARS, runRentCalculator, type CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { OBJECTIVES, compareScores, type ObjectiveId } from './objectives';

/**
 * Ein Optimierungsvorschlag (SCRUM-96, Schnitt 3). Rechnet den heutigen Plan
 * und den optimierten Plan und liefert die Zeitpunkte zum Übernehmen — die
 * Planung selbst ändert sich erst, wenn die Seite sie übernimmt.
 */

export type KeyFigures = { breakEven: string | null; sustainablyPositiveFrom: string | null; rentSumInView: number; cashflowAtViewEnd: number };
export type PlacementChange = { id: string; title: string; from: string; to: string };
export type OptimizationProposal = {
  objective: ObjectiveId;
  placements: Record<string, string>;
  before: KeyFigures;
  after: KeyFigures;
  changes: PlacementChange[];
  improved: boolean;
};

type Result = ReturnType<typeof runRentCalculator>;

// `income` is 0 before the rental start month and equals the monthly rent
// from then on; the engine's own `rentSumInView` (ScoredPlan.rentSumInView)
// sums `income` rather than `rentTotal` for that reason, so `keyFigures`
// mirrors that here for consistency (row.rentTotal happens to equal
// row.income in the current engine, but income is the semantically correct
// field to sum).
export function keyFigures(result: Result, viewPeriodYears: number): KeyFigures {
  const end = Math.min(viewPeriodYears * 12, result.timeline.length);
  const inView = result.timeline.slice(0, end);
  return {
    breakEven: result.breakEven,
    sustainablyPositiveFrom: result.sustainablyPositiveFrom,
    rentSumInView: Math.round(inView.reduce((sum, row) => sum + row.income, 0) * 100) / 100,
    cashflowAtViewEnd: inView[inView.length - 1]?.cumulativeCashflow ?? 0,
  };
}

function monthsFrom(start: string, month: string | null): number {
  if (!month) return 9999;
  const [sy, sm] = start.split('-').map(Number);
  const [y, m] = month.split('-').map(Number);
  return (y - sy) * 12 + (m - sm);
}

function scoreOf(objective: ObjectiveId, figures: KeyFigures, result: Result, start: string): number[] {
  return OBJECTIVES[objective].score({
    breakEvenOffset: monthsFrom(start, figures.breakEven),
    endingCashflow: result.metrics.endingCashflow,
    sustainablyPositiveOffset: monthsFrom(start, figures.sustainablyPositiveFrom),
    rentSumInView: figures.rentSumInView,
  });
}

export function runOptimization(params: CalculatorParams, cases: RenovationCase[], objective: ObjectiveId): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;
  const viewPeriodYears = params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS;
  const current = runRentCalculator(params, cases);
  if (current.modernizationPlan.length === 0) return null;

  const optimized = runRentCalculator(
    { ...params, placementMode: 'OPTIMIZED', modernizationPlacements: undefined, rentIncreaseOverrides: undefined, rentIncreasePlan: undefined, optimizationObjective: objective },
    cases,
  );
  const placements = Object.fromEntries(optimized.modernizationPlan.map((row) => [row.id, row.effectiveYyyymm]));
  const replay = runRentCalculator({ ...params, placementMode: 'DEFAULT', modernizationPlacements: placements, rentIncreaseOverrides: undefined, rentIncreasePlan: undefined }, cases);

  const before = keyFigures(current, viewPeriodYears);
  const after = keyFigures(replay, viewPeriodYears);
  const currentMonth = new Map(current.modernizationPlan.map((row) => [row.id, row.effectiveYyyymm]));
  const changes = replay.modernizationPlan
    .filter((row) => currentMonth.get(row.id) !== row.effectiveYyyymm)
    .map((row) => ({ id: row.id, title: row.title, from: currentMonth.get(row.id) ?? '', to: row.effectiveYyyymm }));

  return {
    objective,
    placements,
    before,
    after,
    changes,
    improved: compareScores(scoreOf(objective, after, replay, params.startYyyymm), scoreOf(objective, before, current, params.startYyyymm)) < 0,
  };
}
