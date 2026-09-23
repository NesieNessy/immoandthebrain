/**
 * Optimization objectives for the modernization optimizer (SCRUM-96).
 *
 * An objective turns one evaluated plan into a lexicographic score: a tuple
 * compared element-wise, smaller is better, the next element breaks ties.
 * This keeps every goal (earliest break-even, fastest positive cashflow, …)
 * a small declarative rule while the search itself — and with it the single
 * implementation of the §558/§559 rules in runRentCalculator — stays shared.
 *
 * Kept structural (no import from rentCalculator) so rentCalculator can import
 * this module without a dependency cycle.
 */

/** The figures the optimizer has for every candidate plan. */
export type ScoredPlan = {
  /** Months from start until the cumulative cashflow reaches zero; 9999 = never. */
  breakEvenOffset: number;
  /** Cumulative after-tax cashflow at the end of the horizon. */
  endingCashflow: number;
  /** First month from which the monthly after-tax cashflow never turns negative again. */
  sustainablyPositiveOffset: number;
};

export type ObjectiveId = 'EARLIEST_BREAK_EVEN' | 'FASTEST_POSITIVE_CASHFLOW';

export type OptimizationObjective = {
  id: ObjectiveId;
  /** Lexicographic; compared with compareScores, smaller is better. */
  score: (plan: ScoredPlan) => number[];
};

/** Element-wise comparison; the first differing position decides. */
export function compareScores(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

/**
 * The optimizer's original goal. `-endingCashflow` makes "higher is better"
 * sort ascending, which reproduces the former comparator exactly.
 */
export const EARLIEST_BREAK_EVEN: OptimizationObjective = {
  id: 'EARLIEST_BREAK_EVEN',
  score: (plan) => [plan.breakEvenOffset, -plan.endingCashflow],
};

/** Cashflow-Optimierung: reach a lasting positive monthly cashflow as early as possible. */
export const FASTEST_POSITIVE_CASHFLOW: OptimizationObjective = {
  id: 'FASTEST_POSITIVE_CASHFLOW',
  score: (plan) => [plan.sustainablyPositiveOffset, -plan.endingCashflow],
};

export const OBJECTIVES: Record<ObjectiveId, OptimizationObjective> = {
  EARLIEST_BREAK_EVEN,
  FASTEST_POSITIVE_CASHFLOW,
};
