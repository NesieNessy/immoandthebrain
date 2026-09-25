# SCRUM-96 Schnitt 3 – Optimierung I Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Auswertungs-Panel die drei Optimierungen „Optimaler Zeitpunkt", „Mieterhöhungsstrategie" und „Cashflow-Optimierung" startbar machen: Rechnung im Web Worker, Ergebnis als Vorschlag (vorher/nachher), Übernahme in die Gantt-Planung per „Übernehmen".

**Architecture:** Der vorhandene Beam-Search-Optimierer bekommt sein Ziel über `params.optimizationObjective` (Register aus Schnitt 0, um ein drittes Ziel erweitert). Eine reine Funktion `runOptimization` (`analysis/optimize.ts`) rechnet einen Vorschlag; ein Web Worker führt sie aus, damit die ~4 s pro Ziel den Tab nicht einfrieren. Übernehmen läuft über das vorhandene `commitOverrides` der Seite (erbt Speichern, Übernehmen-Dialog, Fingerprint). Schnitt 2 (Simulationen) wird übersprungen; die Chips bleiben „folgt".

**Tech Stack:** Next.js 15 (webpack, `new Worker(new URL(…, import.meta.url))`), React 19, TypeScript, Vitest (node).

## Global Constraints

- Arbeitsverzeichnis `apps/web`; Checks: `npm run type-check && npm run lint && npm run test` (`--max-warnings=0`).
- Bitgleichheit: Ohne `optimizationObjective` (oder mit `'EARLIEST_BREAK_EVEN'`) liefert der Optimierer exakt das heutige Ergebnis; `rentCalculator.optimizerParity.test.ts` und `rentCalculator.parity.test.ts` bleiben unverändert grün.
- Scores laut Spec: Optimaler Zeitpunkt `[Break-even-Monat, −CF(H)]`; Mieterhöhungsstrategie `[−Σ Miete über B, Break-even-Monat]`; Cashflow-Optimierung `[erster Monat ab dem cf(t) ≥ 0 bleibt, −CF(H)]`. B = `params.viewPeriodYears` (Standard 15).
- Suchraum in Schnitt 3: nur Zeitpunkte der geplanten Maßnahmen (keine Auswahl). §558 folgt regelkonform aus der Engine.
- Optimierungskarten sind **Vorschläge**; die Planung ändert sich erst bei „Übernehmen".
- Optimierung nur im Modus „KNOWN" (bekannte Maßnahmen); bei „POTENTIAL" oder ohne geplante Maßnahme zeigt die Karte einen Hinweis statt „Starten".
- Keine neuen Abhängigkeiten. Oberfläche Deutsch.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `src/lib/detailCheck/analysis/objectives.ts` (ändern) | Ziel `MAX_RENT_IN_VIEW`, `ScoredPlan.rentSumInView` |
| `src/lib/detailCheck/rentCalculator.ts` (ändern) | `rentSumInView` in `buildTimeline`; `optimizationObjective` in Params, an den Optimierer durchreichen |
| `src/lib/detailCheck/analysis/optimize.ts` (neu) | `runOptimization`: Vorschlag mit vorher/nachher und Änderungsliste |
| `src/lib/detailCheck/analysis/catalog.ts` (ändern) | Verfügbarkeit per Menge umgesetzter Schnitte; Ziel je Optimierungs-Use-Case |
| `src/app/property-valuation/detail-check/calculator/optimizer.worker.ts` (neu) | Worker um `runOptimization` |
| `src/app/property-valuation/detail-check/calculator/useOptimization.ts` (neu) | Hook: Worker starten, Status, Cache, Fallback ohne Worker |
| `src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx` (ändern) | Optimierungskarten mit Starten / Fortschritt / Vorschlag / Übernehmen |
| `src/app/property-valuation/detail-check/calculator/page.tsx` (ändern) | `onApplyPlacements` an das Panel |

---

### Task 1: Drittes Ziel und Ziel-Auswahl in der Engine

**Files:**
- Modify: `src/lib/detailCheck/analysis/objectives.ts`
- Modify: `src/lib/detailCheck/rentCalculator.ts` (`CalculatorParams`, `buildTimeline`, `optimizeKnownModernizations`-Aufruf in `runRentCalculator`)
- Test: `src/lib/detailCheck/analysis/objectives.test.ts`, `src/lib/detailCheck/rentCalculator.objectives.test.ts` (neu)

**Interfaces:**
- Produces:
  - `ScoredPlan.rentSumInView: number` — Σ `rentTotal` der Monate mit Offset `< viewMonths`, `viewMonths = (params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS) * 12`.
  - `ObjectiveId = 'EARLIEST_BREAK_EVEN' | 'FASTEST_POSITIVE_CASHFLOW' | 'MAX_RENT_IN_VIEW'`; `MAX_RENT_IN_VIEW.score = (plan) => [-plan.rentSumInView, plan.breakEvenOffset]`; `OBJECTIVES` enthält alle drei.
  - `CalculatorParams.optimizationObjective?: ObjectiveId` — nur wirksam, wenn `placementMode === 'OPTIMIZED'` und keine `modernizationPlacements`; fehlt/unbekannt = `EARLIEST_BREAK_EVEN`.
  - `buildTimeline(...)` gibt zusätzlich `rentSumInView` zurück.

- [ ] **Step 1: Failing tests**

An `objectives.test.ts` anhängen:

```ts
it('MAX_RENT_IN_VIEW prefers more rent in the view period, then earlier break-even', () => {
  const more = { breakEvenOffset: 50, endingCashflow: 0, sustainablyPositiveOffset: 0, rentSumInView: 200000 };
  const less = { breakEvenOffset: 10, endingCashflow: 0, sustainablyPositiveOffset: 0, rentSumInView: 199000 };
  expect(compareScores(MAX_RENT_IN_VIEW.score(more), MAX_RENT_IN_VIEW.score(less))).toBe(-1);
  const tieEarlier = { ...more, breakEvenOffset: 40 };
  expect(compareScores(MAX_RENT_IN_VIEW.score(tieEarlier), MAX_RENT_IN_VIEW.score(more))).toBe(-1);
});

it('OBJECTIVES registers all three goals', () => {
  expect(Object.keys(OBJECTIVES).sort()).toEqual(['EARLIEST_BREAK_EVEN', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_RENT_IN_VIEW']);
});
```

Vorhandene Tests in `objectives.test.ts`, die `ScoredPlan`-Literale bauen, um `rentSumInView: 0` ergänzen.

Neue Datei `rentCalculator.objectives.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTimeline, runRentCalculator } from './rentCalculator';
import { calculatorParams, renovationCase } from './testFixtures';

const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];
const optimized = (overrides = {}) => calculatorParams({ placementMode: 'OPTIMIZED', ...overrides });

describe('optimizer objective selection', () => {
  it('EARLIEST_BREAK_EVEN explicitly equals the default', () => {
    const implicit = runRentCalculator(optimized(), cases);
    const explicit = runRentCalculator(optimized({ optimizationObjective: 'EARLIEST_BREAK_EVEN' }), cases);
    expect(explicit.modernizationPlan).toEqual(implicit.modernizationPlan);
  });

  it('is ignored when placements are fixed or placementMode is DEFAULT', () => {
    const base = runRentCalculator(calculatorParams(), cases);
    const withGoal = runRentCalculator(calculatorParams({ optimizationObjective: 'MAX_RENT_IN_VIEW' }), cases);
    expect(withGoal.modernizationPlan).toEqual(base.modernizationPlan);
  });

  it('MAX_RENT_IN_VIEW never yields less rent in B than the break-even optimum', () => {
    const sumInView = (params: ReturnType<typeof optimized>) => {
      const result = runRentCalculator(params, cases);
      return result.timeline.slice(0, 15 * 12).reduce((sum, row) => sum + row.rentTotal, 0);
    };
    expect(sumInView(optimized({ optimizationObjective: 'MAX_RENT_IN_VIEW' })))
      .toBeGreaterThanOrEqual(sumInView(optimized({ optimizationObjective: 'EARLIEST_BREAK_EVEN' })) - 0.01);
  });

  it('FASTEST_POSITIVE_CASHFLOW never reaches a lasting positive cashflow later than the break-even optimum', () => {
    const month = (goal: 'FASTEST_POSITIVE_CASHFLOW' | 'EARLIEST_BREAK_EVEN') =>
      runRentCalculator(optimized({ optimizationObjective: goal, monthlyDebtService: 900 }), cases).sustainablyPositiveFrom ?? '9999-12';
    expect(month('FASTEST_POSITIVE_CASHFLOW') <= month('EARLIEST_BREAK_EVEN')).toBe(true);
  });

  it('rentSumInView sums rentTotal over the view period', () => {
    const params = calculatorParams({ viewPeriodYears: 10 });
    const result = runRentCalculator(params, cases);
    const timeline = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan);
    const expected = result.timeline.slice(0, 120).reduce((sum, row) => sum + row.rentTotal, 0);
    expect(timeline.rentSumInView).toBeCloseTo(expected, 2);
  });
});
```

Hinweis: Beam Search ist heuristisch; die beiden „never worse"-Tests gelten, weil jedes Ziel sein eigenes Kriterium an erster Stelle hat und dieselben Kandidaten sieht. Schlägt einer fehl, ist das ein echter Befund — nicht die Assertion abschwächen, sondern berichten. Prüfe vor dem Schreiben die tatsächliche Signatur von `buildTimeline` (vierter/fünfter Parameter) und passe den Aufruf an.

- [ ] **Step 2: Tests müssen fehlschlagen** — `npx vitest run src/lib/detailCheck/analysis/objectives.test.ts src/lib/detailCheck/rentCalculator.objectives.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

`objectives.ts`: `ScoredPlan` um `rentSumInView: number` (Doku: „Σ Monatsmiete über den Betrachtungszeitraum B") ergänzen, `ObjectiveId` erweitern und

```ts
/** Mieterhöhungsstrategie: höchste Mietsumme im Betrachtungszeitraum, bei Gleichstand früherer Break-even. */
export const MAX_RENT_IN_VIEW: OptimizationObjective = {
  id: 'MAX_RENT_IN_VIEW',
  score: (plan) => [-plan.rentSumInView, plan.breakEvenOffset],
};
```

in `OBJECTIVES` aufnehmen.

`rentCalculator.ts`:
- `CalculatorParams`: `optimizationObjective?: ObjectiveId;` (Import-Typ aus `./analysis/objectives`) mit Doku wie oben.
- `buildTimeline`: vor der Monatsschleife `const viewMonths = (params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS) * 12; let rentSumInView = 0;`, in der Schleife nach Berechnung von `rentTotal` für den Monatsoffset `offset`: `if (offset < viewMonths) rentSumInView += rentTotal;` (Variable für den Offset so verwenden, wie die Schleife sie nennt), am Ende `rentSumInView: roundCurrency(rentSumInView)` zurückgeben. Keine anderen Werte ändern.
- Seed-Kandidat im Optimierer: `rentSumInView: -Infinity` ergänzen (verliert gegen jeden echten Plan, auch bei `MAX_RENT_IN_VIEW`, weil `-(-Infinity) = Infinity`).
- `runRentCalculator`: beim Aufruf von `optimizeKnownModernizations` als letztes Argument `OBJECTIVES[params.optimizationObjective ?? 'EARLIEST_BREAK_EVEN'] ?? EARLIEST_BREAK_EVEN` übergeben.

- [ ] **Step 4: Tests grün** — gezielte Tests, dann `npm run type-check && npm run lint && npm run test` (Golden-Tests unverändert grün).

- [ ] **Step 5: Commit**

```bash
git add src/lib/detailCheck/analysis/objectives.ts src/lib/detailCheck/analysis/objectives.test.ts src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/rentCalculator.objectives.test.ts
git commit -m "feat(calculator): Ziel Mietsumme im Betrachtungszeitraum, Ziel per Parameter waehlbar (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vorschlag rechnen (`runOptimization`) und Katalog

**Files:**
- Create: `src/lib/detailCheck/analysis/optimize.ts`
- Modify: `src/lib/detailCheck/analysis/catalog.ts`
- Test: `src/lib/detailCheck/analysis/optimize.test.ts`, `src/lib/detailCheck/analysis/catalog.test.ts`

**Interfaces:**
- Consumes: `runRentCalculator`, `CalculatorParams`, `ObjectiveId`, `RenovationCase`, `DEFAULT_VIEW_PERIOD_YEARS`.
- Produces:

```ts
// catalog.ts
export const IMPLEMENTED_SLICES: ReadonlySet<number>; // new Set([1, 3])
export const OPTIMIZATION_OBJECTIVE: Partial<Record<UseCaseId, ObjectiveId>>;
// { 'optimaler-zeitpunkt': 'EARLIEST_BREAK_EVEN', 'mieterhoehungsstrategie': 'MAX_RENT_IN_VIEW', 'cashflow-optimierung': 'FASTEST_POSITIVE_CASHFLOW' }
// isAvailable(useCase) = IMPLEMENTED_SLICES.has(useCase.availableFromSlice); CURRENT_SLICE entfällt.

// optimize.ts
export type KeyFigures = { breakEven: string | null; sustainablyPositiveFrom: string | null; rentSumInView: number; cashflowAtViewEnd: number };
export type PlacementChange = { id: string; title: string; from: string; to: string };
export type OptimizationProposal = {
  objective: ObjectiveId;
  placements: Record<string, string>;   // id → effectiveYyyymm, Format wie params.modernizationPlacements
  before: KeyFigures;
  after: KeyFigures;
  changes: PlacementChange[];          // nur Maßnahmen, deren Monat sich ändert
  improved: boolean;                   // after ist nach dem Ziel-Score strikt besser als before
};
export function keyFigures(result: ReturnType<typeof runRentCalculator>, viewPeriodYears: number): KeyFigures;
export function runOptimization(params: CalculatorParams, cases: RenovationCase[], objective: ObjectiveId): OptimizationProposal | null;
// null, wenn params.mode !== 'KNOWN' oder kein geplanter Fall existiert.
```

- [ ] **Step 1: Failing tests**

`catalog.test.ts` — den Slice-1-Test ersetzen:

```ts
it('slices 1 and 3 are available: three evaluations and three optimizations', () => {
  expect(USE_CASES.filter(isAvailable).map((item) => item.id)).toEqual([
    'break-even', 'amortisation', 'wirtschaftlichkeit',
    'optimaler-zeitpunkt', 'mieterhoehungsstrategie', 'cashflow-optimierung',
  ]);
});

it('every available optimization has an objective', () => {
  for (const item of USE_CASES.filter((useCase) => useCase.group === 'optimierung' && isAvailable(useCase))) {
    expect(OPTIMIZATION_OBJECTIVE[item.id]).toBeDefined();
  }
});
```

Prüfe, ob `cards.test.ts` Annahmen über verfügbare Use Cases enthält (z. B. dass `kapitalrendite` herausgefiltert wird — bleibt richtig, Schnitt 4). `buildAnalysisCards` darf für Optimierungs-Use-Cases **keine** Karte erzeugen (die kommen aus dem Panel, Task 4); ergänze in `cards.ts` einen Filter `useCase.group !== 'optimierung'` und einen Test dafür.

`optimize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { keyFigures, runOptimization } from './optimize';

const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];

describe('runOptimization', () => {
  it('returns null outside KNOWN mode or without planned measures', () => {
    expect(runOptimization(calculatorParams({ mode: 'POTENTIAL' }), cases, 'EARLIEST_BREAK_EVEN')).toBeNull();
    expect(runOptimization(calculatorParams(), [], 'EARLIEST_BREAK_EVEN')).toBeNull();
  });

  it('placements reproduce the optimized plan when fed back as fixed placements', () => {
    const params = calculatorParams();
    const proposal = runOptimization(params, cases, 'EARLIEST_BREAK_EVEN')!;
    const optimized = runRentCalculator({ ...params, placementMode: 'OPTIMIZED', modernizationPlacements: undefined }, cases);
    const replay = runRentCalculator({ ...params, modernizationPlacements: proposal.placements }, cases);
    expect(replay.modernizationPlan.map((row) => row.effectiveYyyymm)).toEqual(optimized.modernizationPlan.map((row) => row.effectiveYyyymm));
    expect(proposal.after).toEqual(keyFigures(replay, 15));
  });

  it('before reflects the current plan and changes list only moved measures', () => {
    const params = calculatorParams();
    const proposal = runOptimization(params, cases, 'MAX_RENT_IN_VIEW')!;
    expect(proposal.before).toEqual(keyFigures(runRentCalculator(params, cases), 15));
    for (const change of proposal.changes) expect(change.from).not.toBe(change.to);
    expect(proposal.changes.every((change) => proposal.placements[change.id] === change.to)).toBe(true);
  });

  it('keyFigures reads B from viewPeriodYears', () => {
    const result = runRentCalculator(calculatorParams(), cases);
    const figures = keyFigures(result, 10);
    expect(figures.cashflowAtViewEnd).toBe(result.timeline[119].cumulativeCashflow);
    expect(figures.rentSumInView).toBeCloseTo(result.timeline.slice(0, 120).reduce((sum, row) => sum + row.rentTotal, 0), 2);
  });
});
```

- [ ] **Step 2: Tests müssen fehlschlagen.**

- [ ] **Step 3: Implementieren** — `optimize.ts`:

```ts
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

export function keyFigures(result: Result, viewPeriodYears: number): KeyFigures {
  const end = Math.min(viewPeriodYears * 12, result.timeline.length);
  const inView = result.timeline.slice(0, end);
  return {
    breakEven: result.breakEven,
    sustainablyPositiveFrom: result.sustainablyPositiveFrom,
    rentSumInView: Math.round(inView.reduce((sum, row) => sum + row.rentTotal, 0) * 100) / 100,
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
```

Prüfe vor dem Schreiben: (a) ob das Zurücksetzen von `rentIncreasePlan`/`rentIncreaseOverrides` für `replay` der Logik der Seite beim Optimieren entspricht (die Seite schickt beim Optimieren `resetRentIncreasePlan: true`) — ja, so ist der Vorschlag der Plan, den die Seite nach „Übernehmen" mit zurückgesetztem §558-Plan rechnet; (b) ob `effectiveYyyymm` wirklich das Format von `modernizationPlacements` ist (`page.tsx`: `planPlacement = … modernizationPlacements?.[item.id] ?? item.effectiveYyyymm` — ja). Falls der Test „placements reproduce the optimized plan" fehlschlägt, weil der Replay die Zahlung anders legt, die Ursache berichten statt den Test abzuschwächen.

`catalog.ts`: `CURRENT_SLICE` durch `IMPLEMENTED_SLICES = new Set([1, 3])` ersetzen, `isAvailable` anpassen, `OPTIMIZATION_OBJECTIVE` wie oben (Import-Typ `ObjectiveId`). Alle Verwendungen von `CURRENT_SLICE` im Repo anpassen (`grep -rn CURRENT_SLICE src`).

- [ ] **Step 4: Tests grün** — `npx vitest run src/lib/detailCheck/analysis`, dann alle Checks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/detailCheck/analysis/optimize.ts src/lib/detailCheck/analysis/optimize.test.ts src/lib/detailCheck/analysis/catalog.ts src/lib/detailCheck/analysis/catalog.test.ts src/lib/detailCheck/analysis/cards.ts src/lib/detailCheck/analysis/cards.test.ts
git commit -m "feat(analysis): Optimierungsvorschlag mit vorher/nachher, Optimierungen im Katalog freigeschaltet (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web Worker und Hook

**Files:**
- Create: `src/app/property-valuation/detail-check/calculator/optimizer.worker.ts`
- Create: `src/app/property-valuation/detail-check/calculator/useOptimization.ts`

**Interfaces:**
- Consumes: `runOptimization`, `OptimizationProposal`, `ObjectiveId`.
- Produces:

```ts
export type OptimizationState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; proposal: OptimizationProposal | null; durationMs: number }
  | { status: 'error'; message: string };

export function useOptimization(params: CalculatorParams, cases: RenovationCase[]): {
  stateFor: (objective: ObjectiveId) => OptimizationState;
  start: (objective: ObjectiveId) => void;
};
```

Keine Unit-Tests (DOM/Worker nicht im node-Testsetup); Nachweis über Typprüfung und Browser.

- [ ] **Step 1: Worker** — `optimizer.worker.ts`:

```ts
/// <reference lib="webworker" />
import { runOptimization } from '@/lib/detailCheck/analysis/optimize';
import type { ObjectiveId } from '@/lib/detailCheck/analysis/objectives';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';

type Request = { requestId: number; params: CalculatorParams; cases: RenovationCase[]; objective: ObjectiveId };

self.onmessage = (event: MessageEvent<Request>) => {
  const { requestId, params, cases, objective } = event.data;
  const startedAt = performance.now();
  try {
    const proposal = runOptimization(params, cases, objective);
    self.postMessage({ requestId, ok: true, proposal, durationMs: performance.now() - startedAt });
  } catch (error) {
    self.postMessage({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
```

Falls `tsconfig` `lib: ["webworker"]` nicht zulässt oder die Referenz Typkonflikte mit `dom` erzeugt: statt der Referenz `const ctx = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };` verwenden.

- [ ] **Step 2: Hook** — `useOptimization.ts`:

```ts
"use client";

import { runOptimization } from '@/lib/detailCheck/analysis/optimize';
import type { ObjectiveId } from '@/lib/detailCheck/analysis/objectives';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OptimizationProposal } from '@/lib/detailCheck/analysis/optimize';

export type OptimizationState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; proposal: OptimizationProposal | null; durationMs: number }
  | { status: 'error'; message: string };

const IDLE: OptimizationState = { status: 'idle' };

/**
 * Startet Optimierungen im Web Worker (bis zu drei parallel, je Ziel ein
 * Worker) und cacht die Ergebnisse je Eingabestand: ändert sich die Planung,
 * gelten alte Vorschläge nicht mehr und die Karten zeigen wieder „Starten".
 */
export function useOptimization(params: CalculatorParams, cases: RenovationCase[]) {
  // Betrachtungszeitraum gehört dazu: er ist Teil des Ziels „Mietsumme über B".
  const inputKey = useMemo(() => JSON.stringify({ params, cases }), [params, cases]);
  const [states, setStates] = useState<Record<string, OptimizationState>>({});
  const workersRef = useRef(new Map<ObjectiveId, Worker>());
  const requestIdRef = useRef(0);

  useEffect(() => {
    setStates({});
    for (const worker of workersRef.current.values()) worker.terminate();
    workersRef.current.clear();
  }, [inputKey]);

  useEffect(() => () => {
    for (const worker of workersRef.current.values()) worker.terminate();
  }, []);

  const stateFor = useCallback((objective: ObjectiveId) => states[`${inputKey}|${objective}`] ?? IDLE, [states, inputKey]);

  const start = useCallback((objective: ObjectiveId) => {
    const key = `${inputKey}|${objective}`;
    const requestId = ++requestIdRef.current;
    setStates((current) => ({ ...current, [key]: { status: 'running', startedAt: Date.now() } }));

    if (typeof Worker === 'undefined') {
      const startedAt = performance.now();
      window.setTimeout(() => {
        try {
          const proposal = runOptimization(params, cases, objective);
          setStates((current) => ({ ...current, [key]: { status: 'done', proposal, durationMs: performance.now() - startedAt } }));
        } catch (error) {
          setStates((current) => ({ ...current, [key]: { status: 'error', message: error instanceof Error ? error.message : String(error) } }));
        }
      }, 0);
      return;
    }

    workersRef.current.get(objective)?.terminate();
    const worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url));
    workersRef.current.set(objective, worker);
    worker.onmessage = (event: MessageEvent<{ requestId: number; ok: boolean; proposal?: OptimizationProposal | null; durationMs?: number; message?: string }>) => {
      if (event.data.requestId !== requestId) return;
      worker.terminate();
      workersRef.current.delete(objective);
      setStates((current) => ({
        ...current,
        [key]: event.data.ok
          ? { status: 'done', proposal: event.data.proposal ?? null, durationMs: event.data.durationMs ?? 0 }
          : { status: 'error', message: event.data.message ?? 'Unbekannter Fehler' },
      }));
    };
    worker.onerror = (event) => {
      worker.terminate();
      workersRef.current.delete(objective);
      setStates((current) => ({ ...current, [key]: { status: 'error', message: event.message || 'Worker-Fehler' } }));
    };
    worker.postMessage({ requestId, params, cases, objective });
  }, [inputKey, params, cases]);

  return { stateFor, start };
}
```

- [ ] **Step 3: Checks** — `npm run type-check && npm run lint && npm run test`. Zusätzlich `npx next build` im Ordner `apps/web` einmal laufen lassen, um zu prüfen, dass webpack den Worker bündelt (Ausgabe auf Fehler zum Worker prüfen; Build-Artefakte nicht committen). Falls `next build` wegen fehlender Umgebungsvariablen an anderer Stelle scheitert, das berichten und nur prüfen, dass der Fehler nicht den Worker betrifft.

- [ ] **Step 4: Commit**

```bash
git add src/app/property-valuation/detail-check/calculator/optimizer.worker.ts src/app/property-valuation/detail-check/calculator/useOptimization.ts
git commit -m "feat(calculator): Optimierung im Web Worker mit Cache je Eingabestand (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Optimierungskarten im Panel und Übernehmen

**Files:**
- Modify: `src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx`
- Modify: `src/app/property-valuation/detail-check/calculator/page.tsx`

**Interfaces:**
- Consumes: `useOptimization`, `OptimizationState` (Task 3); `OPTIMIZATION_OBJECTIVE`, `isAvailable` (Task 2); `OptimizationProposal`, `KeyFigures`.
- Produces: `AnalysisPanel` bekommt `onApplyPlacements: (placements: Record<string, string>) => void` und `mode: CalculatorMode`.

- [ ] **Step 1: Karten** — in `AnalysisPanel.tsx`:
  - `const optimization = useOptimization(params, cases);`
  - Für jeden ausgewählten, verfügbaren Use Case mit `group === 'optimierung'` eine Karte `OptimizationCard` nach den Auswertungskarten rendern (Katalogreihenfolge).
  - Kartenzustände:
    - `mode !== 'KNOWN'` → Tag „Nur mit bekannten Maßnahmen" (muted), Text „Im Szenario Potenzial gibt es keine Zeitpunkte zu optimieren."
    - `idle` → Frage des Use Cases als Text, Button „Optimierung starten" (`Button` aus `@/components/ui`, `variant="outline"`, Icon `Sparkles`).
    - `running` → Spinner (`Loader2` mit `animate-spin`) + „Rechnet … (ca. 5 Sekunden)"; kein zweiter Start.
    - `error` → Tag „Fehler" (danger) + Meldung + Button „Erneut versuchen".
    - `done` mit `proposal === null` → Tag „Keine Maßnahme geplant" (muted).
    - `done` mit Vorschlag:
      - Tag: `improved` → „Verbesserung" (success), sonst „Plan ist bereits optimal" (muted).
      - Tabelle vorher/nachher mit drei Spalten (Kennzahl · Aktuell · Vorschlag) und den Zeilen Break-even, „Cashflow dauerhaft positiv ab", „Mietsumme in {B} Jahren", „Kumulierter Cashflow nach {B} Jahren". Monate als `MM/YYYY`, „nicht erreicht" bei `null`, Beträge `de-DE` EUR ohne Nachkommastellen. Die Zeile des Ziels fett.
      - Liste der Änderungen „{title}: {MM/YYYY} → {MM/YYYY}", bei leerer Liste „Keine Verschiebung nötig."
      - Button „Übernehmen" (primär) nur wenn `improved && changes.length > 0`; Klick ruft `onApplyPlacements(proposal.placements)`.
      - Kleiner Text „Berechnet in {x,x} s".
  - Welche Zeile fett ist: `EARLIEST_BREAK_EVEN` → Break-even, `FASTEST_POSITIVE_CASHFLOW` → dauerhaft positiv, `MAX_RENT_IN_VIEW` → Mietsumme.
  - Formatierungsfunktionen nicht duplizieren: falls `cards.ts` passende Formatierer hat, sie dort exportieren und wiederverwenden.

- [ ] **Step 2: Übernehmen verdrahten** — in `page.tsx` beim `<AnalysisPanel …>`:

```tsx
mode={mode}
onApplyPlacements={(placements) => {
  resetRentPlanRef.current = true;
  commitOverrides({ modernizationPlacements: placements, rentIncreaseOverrides: {} });
}}
```

Prüfe, dass das dem Verhalten des vorhandenen Buttons „Sanierungen und Mieterhöhungen optimieren" entspricht (dort `resetRentIncreasePlan` via `recalc(mode, false, true)`): Nach „Übernehmen" müssen Gantt, Kennzahlen oben und die Auswertungskarten den neuen Plan zeigen, und nach dem Speichern + Neuladen bleibt er erhalten. Falls `resetRentPlanRef` beim Speichern nicht zurückgesetzt wird oder `commitOverrides` den §558-Plan anders behandelt, die kleinste Anpassung vornehmen, die dasselbe Ergebnis wie der vorhandene Optimieren-Button erzeugt, und sie im Bericht begründen.

- [ ] **Step 3: Checks** — `npm run type-check && npm run lint && npm run test`.

- [ ] **Step 4: Commit**

```bash
git add src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx src/app/property-valuation/detail-check/calculator/page.tsx src/lib/detailCheck/analysis/cards.ts
git commit -m "feat(calculator): Optimierungen im Auswertungs-Panel startbar, Vorschlag uebernehmen (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 (Controller): Test im Browser und Laufzeit

Kein Subagent-Code; die Hauptsitzung prüft im Browser (nach Freigabe von `localhost:3001` und Login durch den Nutzer):

- Jede der drei Optimierungen starten; der Tab bleibt bedienbar (Scrollen, Gantt), Fortschritt sichtbar.
- Laufzeit je Ziel notieren (Anzeige „Berechnet in …").
- „Übernehmen" → Gantt und Kennzahlen zeigen den Vorschlag; Neuladen → bleibt.
- Nach „Übernehmen" dieselbe Optimierung erneut starten → „Plan ist bereits optimal".
- Konsole ohne Fehler; 375 px ohne horizontales Scrollen.

Liegt die Laufzeit je Ziel über ~6 s, folgt eine Optimierungsaufgabe (z. B. Beam-Breite, Kandidaten-Raster), getrennt geplant und mit Paritätsnachweis.
