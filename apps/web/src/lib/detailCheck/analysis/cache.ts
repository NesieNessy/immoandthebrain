import { runRentCalculator, type CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';

/**
 * Lauf-Cache für eine einzelne `recommend()`/`optimizeSelection()`-Anfrage
 * (SCRUM-96, Performance). `runRentCalculator` ist eine reine Funktion von
 * `params` (plus der über die ganze Anfrage konstanten `cases`) — Stufe 1 von
 * `optimizeSelection` rechnet für MAX_ROI und MAX_EQUITY_IRR exakt dieselben
 * Teilmengen, und `recommend()` ruft beide Ziele nacheinander auf, ruft also
 * `runRentCalculator` mehrfach mit identischen `params` auf. Der Cache lebt
 * nur für die Dauer einer Anfrage (neu erzeugt je Top-Level-Aufruf), damit er
 * nie über verschiedene Eingabestände hinweg veraltete Ergebnisse liefert.
 */
export type Result = ReturnType<typeof runRentCalculator>;

export type AnalysisCache = {
  runs: Map<string, Result>;
  /** Fertige `OptimizationProposal` je (params, objective) — vermeidet doppelte Feinoptimierung (z. B. EARLIEST_BREAK_EVEN als Ziel und in Stufe 2 der Auswahl-Suche). */
  proposals: Map<string, unknown>;
};

export function createAnalysisCache(): AnalysisCache {
  return { runs: new Map(), proposals: new Map() };
}

/** `runRentCalculator`, memoisiert im Cache über den JSON-Schlüssel von `params`. `cases` muss über die Anfrage konstant sein. */
export function cachedRun(cache: AnalysisCache, params: CalculatorParams, cases: RenovationCase[]): Result {
  const key = JSON.stringify(params);
  const hit = cache.runs.get(key);
  if (hit) return hit;
  const result = runRentCalculator(params, cases);
  cache.runs.set(key, result);
  return result;
}

/** Liest/schreibt einen gecachten Proposal-Wert unter `key`; `compute` läuft nur bei Cache-Miss. */
export function cachedProposal<T>(cache: AnalysisCache, key: string, compute: () => T): T {
  if (cache.proposals.has(key)) return cache.proposals.get(key) as T;
  const value = compute();
  cache.proposals.set(key, value);
  return value;
}
