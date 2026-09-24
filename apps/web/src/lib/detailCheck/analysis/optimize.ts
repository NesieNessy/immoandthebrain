import { DEFAULT_VIEW_PERIOD_YEARS, runRentCalculator, type CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { cachedProposal, cachedRun, createAnalysisCache, type AnalysisCache } from './cache';
import { equityIrr, planRoi } from './metrics';
import { OBJECTIVES, compareScores, type ObjectiveId } from './objectives';
import { optimizeSelection, type SelectionGoal } from './selection';

/**
 * Ein Optimierungsvorschlag (SCRUM-96, Schnitt 3/4). Rechnet den heutigen Plan
 * und den optimierten Plan und liefert die Zeitpunkte zum Übernehmen — die
 * Planung selbst ändert sich erst, wenn die Seite sie übernimmt.
 */

export type OptimizationGoal = ObjectiveId | SelectionGoal | 'RECOMMENDATION';

export type KeyFigures = {
  breakEven: string | null;
  sustainablyPositiveFrom: string | null;
  rentSumInView: number;
  cashflowAtViewEnd: number;
  /** Kumulierter Cashflow nach Steuern am Ende des Betrachtungszeitraums (`metrics.endingCashflow`); für die Empfehlung. */
  endingCashflow: number;
  equityIrr: number | null;
  /** Nur für ROI-Ziele/Vorschläge gefüllt — sonst `null` (`keyFigures` allein kennt die "ohne"-Basis nicht). */
  roi: number | null;
};
export type PlacementChange = { id: string; title: string; from: string; to: string };
export type OptimizationProposal = {
  goal: OptimizationGoal;
  placements: Record<string, string>;
  before: KeyFigures;
  after: KeyFigures;
  changes: PlacementChange[];
  improved: boolean;
  excludedModernizationIds: string[];
  excludedTitles: string[];
  reasoning?: string[];
  chosenGoal?: OptimizationGoal;
  tooMany?: boolean;
  /** MAX_EQUITY_IRR only: `equityAmount` is 0 (or unset), so `equityIrr` is `null` for every candidate — there is nothing to optimize for and no subset should be picked arbitrarily (browser-fix, SCRUM-96). */
  noEquity?: boolean;
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
    endingCashflow: result.metrics.endingCashflow,
    equityIrr: equityIrr(result, viewPeriodYears),
    roi: null,
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

function changesOf(current: Result, replay: Result): PlacementChange[] {
  const currentMonth = new Map(current.modernizationPlan.map((row) => [row.id, row.effectiveYyyymm]));
  return replay.modernizationPlan
    .filter((row) => currentMonth.has(row.id) && currentMonth.get(row.id) !== row.effectiveYyyymm)
    .map((row) => ({ id: row.id, title: row.title, from: currentMonth.get(row.id) ?? '', to: row.effectiveYyyymm }));
}

/** Optimierung für ein Zeitpunkt-Ziel (`ObjectiveId`) — unverändert aus Schnitt 3, jetzt über `cache` memoisiert. */
function runObjectiveGoal(params: CalculatorParams, cases: RenovationCase[], objective: ObjectiveId, cache: AnalysisCache): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;

  // Dieselbe (params, objective)-Kombination kann sowohl als eigenes Ziel als
  // auch aus Stufe 2 der Auswahl-Suche (selection.ts, EARLIEST_BREAK_EVEN auf
  // demselben Ausschluss) angefragt werden — Feinoptimierung nicht doppelt
  // rechnen.
  const key = `objective:${objective}:${JSON.stringify(params)}`;
  return cachedProposal(cache, key, () => {
    const viewPeriodYears = params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS;
    const current = cachedRun(cache, params, cases);
    if (current.modernizationPlan.length === 0) return null;

    const optimized = cachedRun(
      cache,
      { ...params, placementMode: 'OPTIMIZED', modernizationPlacements: undefined, rentIncreaseOverrides: undefined, rentIncreasePlan: undefined, optimizationObjective: objective },
      cases,
    );
    const placements = Object.fromEntries(optimized.modernizationPlan.map((row) => [row.id, row.effectiveYyyymm]));
    const replay = cachedRun(cache, { ...params, placementMode: 'DEFAULT', modernizationPlacements: placements, rentIncreaseOverrides: undefined, rentIncreasePlan: undefined }, cases);

    const before = keyFigures(current, viewPeriodYears);
    const after = keyFigures(replay, viewPeriodYears);
    const changes = changesOf(current, replay);

    return {
      goal: objective,
      placements,
      before,
      after,
      changes,
      // Same guard as the selection goals: no placement moved ⇒ never "improved",
      // even if float noise made the score compare as strictly better (browser-fix, SCRUM-96).
      improved: changes.length > 0 && compareScores(scoreOf(objective, after, replay, params.startYyyymm), scoreOf(objective, before, current, params.startYyyymm)) < 0,
      excludedModernizationIds: [],
      excludedTitles: [],
    };
  });
}

/** Auswahl-Ziel (ROI / EK-Rendite, SCRUM-96 Schnitt 4): sucht über Ausschluss-Teilmengen, siehe selection.ts. */
function runSelectionGoal(params: CalculatorParams, cases: RenovationCase[], goal: SelectionGoal, cache: AnalysisCache): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;
  const viewPeriodYears = params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS;
  const current = cachedRun(cache, params, cases);
  if (current.modernizationPlan.length === 0) return null;

  const selection = optimizeSelection(params, cases, goal, cache);
  if (selection === null) return null;

  const before = keyFigures(current, viewPeriodYears);

  if ('tooMany' in selection) {
    return {
      goal,
      placements: {},
      before,
      after: before,
      changes: [],
      improved: false,
      excludedModernizationIds: [],
      excludedTitles: [],
      tooMany: true,
    };
  }

  if ('noEquity' in selection) {
    return {
      goal,
      placements: {},
      before,
      after: before,
      changes: [],
      improved: false,
      excludedModernizationIds: [],
      excludedTitles: [],
      noEquity: true,
    };
  }

  const baseExcluded = params.excludedModernizationIds ?? [];
  const allExcluded = [...baseExcluded, ...selection.excludedModernizationIds];
  const withoutAny = cachedRun(
    cache,
    {
      ...params,
      placementMode: 'DEFAULT',
      modernizationPlacements: undefined,
      rentIncreaseOverrides: undefined,
      rentIncreasePlan: undefined,
      excludedModernizationIds: [...baseExcluded, ...current.modernizationPlan.map((row) => row.id)],
    },
    cases,
  );
  const replay = cachedRun(
    cache,
    {
      ...params,
      placementMode: 'DEFAULT',
      modernizationPlacements: selection.placements,
      rentIncreaseOverrides: undefined,
      rentIncreasePlan: undefined,
      excludedModernizationIds: allExcluded,
    },
    cases,
  );

  const goalMetric = (result: Result) => (goal === 'MAX_ROI' ? planRoi(result, withoutAny, viewPeriodYears) : equityIrr(result, viewPeriodYears));
  const after: KeyFigures = { ...keyFigures(replay, viewPeriodYears), roi: goal === 'MAX_ROI' ? goalMetric(replay) : null };
  const beforeWithMetric: KeyFigures = { ...before, roi: goal === 'MAX_ROI' ? goalMetric(current) : null };

  const beforeScore = goalMetric(current);
  const afterScore = goalMetric(replay);
  const changes = changesOf(current, replay);
  // A proposal only counts as "improved" — and only then offers "Übernehmen"
  // — when it actually changes the plan (placement or exclusion) AND is
  // strictly better by the goal's own metric; an unchanged plan must never
  // read as improved even if float noise nudges the score (browser-fix,
  // SCRUM-96).
  const planChanged = changes.length > 0 || selection.excludedModernizationIds.length > 0;
  const improved = planChanged && (beforeScore == null ? afterScore != null : afterScore != null && afterScore > beforeScore + 1e-9);

  const titleById = new Map(cases.map((item) => [item.id, item.massnahme]));
  const excludedTitles = selection.excludedModernizationIds.map((id) => titleById.get(id) ?? id);

  return {
    goal,
    placements: selection.placements,
    before: beforeWithMetric,
    after,
    changes,
    improved,
    excludedModernizationIds: selection.excludedModernizationIds,
    excludedTitles,
  };
}

/** Zentraler Einstieg (SCRUM-96, Schnitt 4): Zeitpunkt-Ziele, Auswahl-Ziele. `RECOMMENDATION` läuft nur über `recommend`. */
export function runGoal(params: CalculatorParams, cases: RenovationCase[], goal: OptimizationGoal, cache: AnalysisCache = createAnalysisCache()): OptimizationProposal | null {
  if (goal === 'MAX_ROI' || goal === 'MAX_EQUITY_IRR') return runSelectionGoal(params, cases, goal, cache);
  if (goal === 'RECOMMENDATION') return null;
  return runObjectiveGoal(params, cases, goal, cache);
}

/** Dünner Wrapper für Bestandscode/-tests (Schnitt 3): `objective` hieß früher das Feld, jetzt `goal`. `cache` optional — teilt Zwischenergebnisse mit einem umgebenden `recommend()`/`optimizeSelection()`-Aufruf. */
export function runOptimization(params: CalculatorParams, cases: RenovationCase[], objective: ObjectiveId, cache?: AnalysisCache): OptimizationProposal | null {
  return runGoal(params, cases, objective, cache);
}
