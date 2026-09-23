# SCRUM-96 Schnitt 0 – Fundament: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rent calculator engine correct and extensible for the SCRUM-96 analysis layer: configurable rent-index growth, pre-purchase §558 increase in the Kappungsgrenze window, a "sustainably positive cashflow" counter, an "excluded measures" override, and a pluggable objective for the modernization optimizer — all without changing today's results.

**Architecture:** All changes live in the pure calculation library `apps/web/src/lib/detailCheck/`. Every new input is optional and defaults to today's behaviour, so the existing golden snapshot (`realWorkflowSnapshot`) stays bit-identical. The optimizer gets an objective parameter backed by a new registry in `lib/detailCheck/analysis/objectives.ts`; a new golden snapshot of the optimized plan proves the refactor is bit-identical.

**Tech Stack:** TypeScript (strict), Next.js 15 monorepo, vitest 4 (node environment). Spec: `docs/superpowers/specs/2026-09-23-scrum-96-zielformeln-optimierung-design.md`.

## Global Constraints

- Run all commands from `/Users/mail/Documents/immo/apps/web`.
- TypeScript strict; no `any`.
- Code comments in English, matching the existing files; explain WHY, not what.
- Every new input is optional and its default reproduces today's behaviour exactly.
- `src/lib/detailCheck/rentCalculator.parity.test.ts` (golden snapshot `realWorkflowSnapshot`) must pass unchanged after every task. Never edit `realWorkflowSnapshot.expected.json`.
- Do not add fields to the `metrics` object of `runRentCalculator` (the golden snapshot compares `metrics` with `toEqual`). New outputs go on the top level of the result.
- Do not touch `Math.pow(1.02, …)` in `buildTimeline` (line ~528, `annualCostFactor`): that is the service-charge increase, not the rent index.
- No UI changes and no database changes in this cut.
- Stage only the files listed in each task. The working tree contains an unrelated uncommitted change in `apps/web/src/app/property-valuation/detail-check/page.tsx` that must not be committed here.
- Commit messages end with the line: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Full verification per task: `npm run type-check`, `npm run lint`, `npm run test` — all clean.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the feature branch from main**

```bash
cd /Users/mail/Documents/immo && git checkout main && git pull && git checkout -b feat/scrum-96-schnitt-0
```

Expected: `Switched to a new branch 'feat/scrum-96-schnitt-0'`. `git status --short` may still show ` M apps/web/src/app/property-valuation/detail-check/page.tsx` — leave it alone.

---

### Task 1: Rent-index growth as an input

Today the ortsübliche Vergleichsmiete grows by a hard-wired 2 % per year, stepped yearly, in two places (`plan558`, `applyRentIncreaseOverrides`). SCRUM-96 requires it as a customer input. Default 2 % must stay bit-identical — verified: in JavaScript `1 + 2/100 === 1.02` and `Math.pow(1 + 2/100, n) === Math.pow(1.02, n)` for n = 0, 5, 49.

**Files:**
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.ts` (type `CalculatorParams`; `plan558` line ~308; `applyRentIncreaseOverrides` line ~391)
- Create: `apps/web/src/lib/detailCheck/rentCalculator.growth.test.ts`

**Interfaces:**
- Produces: `CalculatorParams.rentIndexGrowthPercent?: number` and `export const DEFAULT_RENT_INDEX_GROWTH_PERCENT = 2` in `rentCalculator.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/detailCheck/rentCalculator.growth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_RENT_INDEX_GROWTH_PERCENT, runRentCalculator } from './rentCalculator';
import { calculatorParams } from './testFixtures';

/**
 * The ortsübliche Vergleichsmiete used to grow by a hard-wired 2 % per year.
 * SCRUM-96 makes it a customer input; these tests pin that the default is
 * exactly the old behaviour and that the input actually drives the plan.
 *
 * rentIndexPerM2: 12 on 100 m² with a 10 €/m² start rent makes the rent index
 * (not the Kappungsgrenze) the binding ceiling after the first increase, so
 * growth is what decides whether and how much the rent can rise later.
 */
describe('rent-index growth (SCRUM-96)', () => {
  const base = calculatorParams({ rentIndexPerM2: 12 });

  it('defaults to 2 %', () => {
    expect(DEFAULT_RENT_INDEX_GROWTH_PERCENT).toBe(2);
  });

  it('omitting the input is bit-identical to an explicit 2 %', () => {
    const implicit = runRentCalculator(base, []);
    const explicit = runRentCalculator({ ...base, rentIndexGrowthPercent: 2 }, []);
    expect(explicit.increases558WithRentIndex).toEqual(implicit.increases558WithRentIndex);
    expect(explicit.increases558).toEqual(implicit.increases558);
    expect(explicit.metrics).toEqual(implicit.metrics);
  });

  it('at 0 % the rent reaches the frozen index once and never rises again', () => {
    const result = runRentCalculator({ ...base, rentIndexGrowthPercent: 0 }, []);
    // 12 €/m² × 100 m² = 1.200 € target; 1.000 € start; 20 % cap = 200 € — both bind at once.
    expect(result.increases558WithRentIndex.map((item) => [item.effectiveYyyymm, item.monthlyDelta]))
      .toEqual([['2027-04', 200]]);
  });

  it('a higher growth rate yields more total rent increases over the horizon', () => {
    const total = (growth: number) => runRentCalculator({ ...base, rentIndexGrowthPercent: growth }, [])
      .increases558WithRentIndex.reduce((sum, item) => sum + item.monthlyDelta, 0);
    expect(total(4)).toBeGreaterThan(total(2));
    expect(total(2)).toBeGreaterThan(total(0));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.growth.test.ts`
Expected: FAIL — `DEFAULT_RENT_INDEX_GROWTH_PERCENT` is not exported, and TypeScript rejects `rentIndexGrowthPercent`.

- [ ] **Step 3: Implement**

In `rentCalculator.ts`, add the field to `CalculatorParams` directly after `rentIndexSource: RentIndexSource;`:

```ts
  /**
   * Annual growth of the ortsübliche Vergleichsmiete in percent, stepped once
   * per year. Omitted = DEFAULT_RENT_INDEX_GROWTH_PERCENT, the value that used
   * to be hard-wired.
   */
  rentIndexGrowthPercent?: number;
```

Add directly below `export const CALCULATION_HORIZON_MONTHS = …;`:

```ts
/** The rent-index growth that used to be hard-wired; kept as the default so results do not move. */
export const DEFAULT_RENT_INDEX_GROWTH_PERCENT = 2;

/**
 * Growth factor of the rent index `offset` months into the projection. Stepped
 * yearly (Math.floor), exactly like the former hard-wired Math.pow(1.02, …):
 * with the default 2 %, `1 + 2 / 100` is bit-identical to 1.02.
 */
function rentIndexGrowthFactor(params: CalculatorParams, offset: number): number {
  const growth = params.rentIndexGrowthPercent;
  const percent = growth != null && Number.isFinite(growth) ? growth : DEFAULT_RENT_INDEX_GROWTH_PERCENT;
  return Math.pow(1 + percent / 100, Math.floor(offset / 12));
}
```

In `plan558` replace

```ts
    const target = roundCurrency(targetPerM2 * Math.pow(1.02, Math.floor(offset / 12)) * params.livingAreaM2);
```

with

```ts
    const target = roundCurrency(targetPerM2 * rentIndexGrowthFactor(params, offset) * params.livingAreaM2);
```

In `applyRentIncreaseOverrides` (inside `legalMaximumAt`) make the identical replacement of the same line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.growth.test.ts src/lib/detailCheck/rentCalculator.parity.test.ts`
Expected: PASS (both files). The parity file passing proves the default is bit-identical on a real workflow.

- [ ] **Step 5: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/rentCalculator.growth.test.ts
git commit -m "feat(calculator): Mietspiegel-Entwicklung als Eingabe statt fest 2 % (SCRUM-96)

Die Entwicklung der ortsueblichen Vergleichsmiete war an zwei Stellen fest
mit 2 % p. a. verdrahtet. Sie ist jetzt die Eingabe rentIndexGrowthPercent,
Standard 2 % - bitgleich zum bisherigen Verhalten (1 + 2/100 === 1.02).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pre-purchase §558 increase in the Kappungsgrenze window

§558 Abs. 3 caps increases at 20 % (15 % in dense markets) within any three years, measured against the rent at the start of the rolling window. The engine only counts increases made inside the projection. An increase shortly before purchase is invisible because its amount is not an input. Measured with today's code on `calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11' })` (1.000 € → 1.200 € fourteen months before a 2026-01 start): the engine allows `2026-02: +240 €`. Correct is `2027-11: +240 €` — the first month in which the 2024-11 increase has left the 36-month window.

**Files:**
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.ts` (`CalculatorParams`; `plan558`; `applyRentIncreaseOverrides`)
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.rules.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `CalculatorParams.last558RentBefore?: number | null`; `export function preProjection558(params: CalculatorParams): { effectiveYyyymm: string; monthlyDelta: number } | null`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/detailCheck/rentCalculator.rules.test.ts` (keep the existing imports; add `preProjection558` to the import from `./rentCalculator`):

```ts
describe('§558 Abs. 3 — increase before the purchase counts in the window', () => {
  // 1.000 € → 1.200 € in 2024-11, fourteen months before the 2026-01 start.
  // Non-dense market (Musterstadt), so the cap is 20 %.
  const params = calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11', last558RentBefore: 1000 });

  it('waits until the pre-purchase increase has left the three-year window', () => {
    const [first] = runRentCalculator(params, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2027-11', 240]);
  });

  it('applies the same window to a manually moved increase', () => {
    const moved = { ...params, rentIncreaseOverrides: { '558-1': { effectiveYyyymm: '2026-06', monthlyDelta: 240 } } };
    const [first] = runRentCalculator(moved, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2027-11', 240]);
  });

  it('keeps today\'s behaviour when the rent before the increase is unknown', () => {
    const unknown = calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11' });
    const [first] = runRentCalculator(unknown, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2026-02', 240]);
  });
});

describe('preProjection558', () => {
  it('is the difference between the current rent and the rent before the increase', () => {
    expect(preProjection558(calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11', last558RentBefore: 1000 })))
      .toEqual({ effectiveYyyymm: '2024-11', monthlyDelta: 200 });
  });

  it('excludes a §559 increase that took effect after it, since §559 is outside the Kappungsgrenze', () => {
    expect(preProjection558(calculatorParams({
      monthlyRentStart: 1300, last558Date: '2024-11', last558RentBefore: 1000,
      last559Date: '2025-06', last559MonthlyDelta: 100,
    }))).toEqual({ effectiveYyyymm: '2024-11', monthlyDelta: 200 });
  });

  it('is null without a date, without the previous rent, or without an actual increase', () => {
    expect(preProjection558(calculatorParams({ last558RentBefore: 900 }))).toBeNull();
    expect(preProjection558(calculatorParams({ last558Date: '2024-11' }))).toBeNull();
    expect(preProjection558(calculatorParams({ monthlyRentStart: 1000, last558Date: '2024-11', last558RentBefore: 1000 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.rules.test.ts`
Expected: FAIL — `preProjection558` is not exported and `last558RentBefore` is not a known field.

- [ ] **Step 3: Implement**

In `CalculatorParams`, directly after `last559MonthlyDelta: number;`:

```ts
  /**
   * Monthly rent before the last §558 increase (the one at last558Date).
   * Needed because §558 Abs. 3 measures the cap against the rent at the start
   * of the rolling three-year window — an increase shortly before purchase
   * uses up part of that window. Omitted = unknown, window counts only
   * increases inside the projection (the former behaviour).
   */
  last558RentBefore?: number | null;
```

Add these two functions directly above `function plan558(`:

```ts
/**
 * The §558 increase that took effect before the projection starts, when the
 * rent before it is known. A §559 increase after it is subtracted, because
 * monthlyRentStart contains it but §558 Abs. 3 excludes §559 from the cap.
 */
export function preProjection558(params: CalculatorParams): { effectiveYyyymm: string; monthlyDelta: number } | null {
  if (!params.last558Date || params.last558RentBefore == null) return null;
  const effectiveYyyymm = normalizeYyyymm(params.last558Date, params.startYyyymm);
  const later559 = params.last559Date
    && compareMonth(params.last559Date, effectiveYyyymm) > 0
    && compareMonth(params.last559Date, params.startYyyymm) <= 0
    ? Math.max(0, params.last559MonthlyDelta)
    : 0;
  const monthlyDelta = roundCurrency(Math.max(0, params.monthlyRentStart - params.last558RentBefore - later559));
  return monthlyDelta > 0 ? { effectiveYyyymm, monthlyDelta } : null;
}

/** The pre-projection increase's share of the window [windowStart, month], or 0. */
function preProjectionUsedInWindow(
  prior: { effectiveYyyymm: string; monthlyDelta: number } | null,
  windowStart: string,
  month: string,
): number {
  return prior
    && compareMonth(prior.effectiveYyyymm, windowStart) >= 0
    && compareMonth(prior.effectiveYyyymm, month) <= 0
    ? prior.monthlyDelta
    : 0;
}
```

In `plan558`, add after `const utilization = …;`:

```ts
  const prior = preProjection558(params);
```

and replace the `usedInWindow` definition

```ts
    const usedInWindow = steps.reduce((sum, step) => {
      if (compareMonth(step.effectiveYyyymm, windowStart) >= 0 && compareMonth(step.effectiveYyyymm, month) <= 0) {
        return sum + step.monthlyDelta;
      }
      return sum;
    }, 0);
```

with

```ts
    const usedInWindow = steps.reduce((sum, step) => {
      if (compareMonth(step.effectiveYyyymm, windowStart) >= 0 && compareMonth(step.effectiveYyyymm, month) <= 0) {
        return sum + step.monthlyDelta;
      }
      return sum;
    }, 0) + preProjectionUsedInWindow(prior, windowStart, month);
```

In `applyRentIncreaseOverrides`, add after `const accepted: RentIncrease558Row[] = [];`:

```ts
  const prior = preProjection558(params);
```

and inside `legalMaximumAt` replace

```ts
    const usedInWindow = accepted
      .filter((item) => compareMonth(item.effectiveYyyymm, windowStart) >= 0)
      .reduce((sum, item) => sum + item.monthlyDelta, 0);
```

with

```ts
    const usedInWindow = accepted
      .filter((item) => compareMonth(item.effectiveYyyymm, windowStart) >= 0)
      .reduce((sum, item) => sum + item.monthlyDelta, 0)
      + preProjectionUsedInWindow(prior, windowStart, effectiveYyyymm);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.rules.test.ts src/lib/detailCheck/rentCalculator.parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/rentCalculator.rules.test.ts
git commit -m "fix(calculator): Mieterhoehung vor dem Kauf im Kappungsfenster beruecksichtigen (SCRUM-96)

Das rollierende Drei-Jahres-Fenster der Kappungsgrenze (§558 Abs. 3) zaehlte
nur Erhoehungen innerhalb der Prognose. Bei einer Erhoehung von 1.000 auf
1.200 EUR vierzehn Monate vor dem Kauf erlaubte die Engine sofort weitere
240 EUR (2026-02); korrekt ist 2027-11. Die neue Eingabe last558RentBefore
macht den Betrag bekannt. Ohne sie bleibt das Verhalten unveraendert.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: "Sustainably positive" counter

The Cashflow-Optimierung objective needs the first month from which the monthly after-tax cashflow never turns negative again. The optimizer calls `buildTimeline(…, includeTimeline = false)` so rows are not materialized; the value must come from the same pass with constant memory.

**Files:**
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.ts` (`buildTimeline`, `runRentCalculator` return)
- Create: `apps/web/src/lib/detailCheck/rentCalculator.sustainablyPositive.test.ts`

**Interfaces:**
- Produces: `buildTimeline` becomes `export function buildTimeline(...)` and its return gains `sustainablyPositiveOffset: number` (months from start; equals `CALCULATION_HORIZON_MONTHS` when never). `runRentCalculator` result gains top-level `sustainablyPositiveFrom: string | null`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/detailCheck/rentCalculator.sustainablyPositive.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addMonths, buildTimeline, CALCULATION_HORIZON_MONTHS, runRentCalculator, type CalculatorParams } from './rentCalculator';
import type { RenovationCase } from './renovation';
import fixture from './__fixtures__/realWorkflowSnapshot.json';
import { calculatorParams } from './testFixtures';

/** Reference computed the slow, obvious way from the materialized timeline. */
function fromTimeline(rows: { afterTaxCashflow: number }[]): number {
  let lastNegative = -1;
  rows.forEach((row, offset) => { if (row.afterTaxCashflow < 0) lastNegative = offset; });
  return lastNegative + 1;
}

describe('sustainably positive cashflow', () => {
  const params = fixture.params as unknown as CalculatorParams;
  const cases = fixture.renovationCases as unknown as RenovationCase[];

  it('matches the materialized timeline on a real workflow', () => {
    const result = runRentCalculator(params, cases);
    const offset = fromTimeline(result.timeline);
    expect(result.sustainablyPositiveFrom).toBe(offset < CALCULATION_HORIZON_MONTHS ? addMonths(params.startYyyymm, offset) : null);
  });

  it('is identical with and without materializing the timeline (the optimizer uses the latter)', () => {
    const result = runRentCalculator(params, cases);
    const withRows = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan, true);
    const withoutRows = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan, false);
    expect(withoutRows.timeline).toHaveLength(0);
    expect(withoutRows.sustainablyPositiveOffset).toBe(withRows.sustainablyPositiveOffset);
    expect(withRows.sustainablyPositiveOffset).toBe(fromTimeline(withRows.timeline));
  });

  it('is the first month when the cashflow is never negative', () => {
    const result = runRentCalculator(calculatorParams(), []);
    expect(result.sustainablyPositiveFrom).toBe('2026-01');
  });

  it('is null when the cashflow is still negative in the last month', () => {
    const result = runRentCalculator(calculatorParams({ monthlyDebtService: 5000, loanAmount: 5_000_000, interestRate: 1 }), []);
    expect(result.sustainablyPositiveFrom).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.sustainablyPositive.test.ts`
Expected: FAIL — `buildTimeline` is not exported.

- [ ] **Step 3: Implement**

Change `function buildTimeline(` to `export function buildTimeline(`.

In `buildTimeline`, add next to the other `let` declarations before the loop:

```ts
  // Last month with a negative after-tax cashflow, tracked in this same pass so
  // the optimizer (includeTimeline = false) gets it without materializing
  // 600 rows per candidate.
  let lastNegativeCashflowOffset = -1;
```

Inside the loop, directly after `const afterTaxCashflow = roundCurrency(monthlyDelta - taxes);`:

```ts
    if (afterTaxCashflow < 0) lastNegativeCashflowOffset = offset;
```

Extend the return object:

```ts
  return {
    timeline,
    breakEven,
    breakEvenWithRentIndex,
    endingCashflow: cumulativeCashflow,
    endingCashflowWithRentIndex: runningWithRentIndex,
    /** First month from which the monthly after-tax cashflow never turns negative again; CALCULATION_HORIZON_MONTHS = never. */
    sustainablyPositiveOffset: lastNegativeCashflowOffset + 1,
  };
```

In `runRentCalculator`'s return object, directly after `breakEvenWithRentIndex: scenario.breakEvenWithRentIndex,`:

```ts
    // Top level, not in `metrics`: the golden snapshot compares `metrics` whole.
    sustainablyPositiveFrom: scenario.sustainablyPositiveOffset < CALCULATION_HORIZON_MONTHS
      ? addMonths(params.startYyyymm, scenario.sustainablyPositiveOffset)
      : null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.sustainablyPositive.test.ts src/lib/detailCheck/rentCalculator.parity.test.ts`
Expected: PASS. If the "null" case does not stay negative with the given financing, raise `monthlyDebtService` until it does — the point of that test is only the `null` branch.

- [ ] **Step 5: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/rentCalculator.sustainablyPositive.test.ts
git commit -m "feat(calculator): Monat ab dem der Cashflow dauerhaft positiv bleibt (SCRUM-96)

buildTimeline ermittelt im selben Durchlauf den ersten Monat, ab dem der
Monats-Cashflow nach Steuern nie wieder negativ wird - ohne die Timeline zu
materialisieren, die der Optimierer bewusst weglaesst. Grundlage fuer das
Ziel Cashflow-Optimierung.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: "Excluded measures" override

A selection proposal (Modernisierungsstrategie, Kapitalrendite) must be representable without writing to the Sanierung step first. The engine filters planned measures in two places (`buildPlanFromPlacements` line ~181 and `optimizeKnownModernizations` line ~645); both must honour the exclusion.

**Files:**
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.ts` (`CalculatorParams`; both filters)
- Modify: `apps/web/src/lib/detailCheck/calculatorParamNormalization.ts` (`CalculatorOverrides`, `overridesFromParams`, `buildEffectiveCalculatorParams`)
- Create: `apps/web/src/lib/detailCheck/rentCalculator.exclusions.test.ts`
- Modify: `apps/web/src/lib/detailCheck/calculatorParamNormalization.test.ts` (append a test)

**Interfaces:**
- Produces: `CalculatorParams.excludedModernizationIds?: string[]`; `CalculatorOverrides.excludedModernizationIds?: string[]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/detailCheck/rentCalculator.exclusions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runRentCalculator } from './rentCalculator';
import { calculatorParams, renovationCase } from './testFixtures';

describe('excluded measures (SCRUM-96 selection proposals)', () => {
  const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];

  it('drops an excluded measure from the default plan', () => {
    const plan = runRentCalculator(calculatorParams({ excludedModernizationIds: ['b'] }), cases).modernizationPlan;
    expect(plan.map((item) => item.id)).toEqual(['a']);
  });

  it('drops an excluded measure from the optimized plan too', () => {
    const plan = runRentCalculator(calculatorParams({ placementMode: 'OPTIMIZED', excludedModernizationIds: ['b'] }), cases).modernizationPlan;
    expect(plan.map((item) => item.id)).toEqual(['a']);
  });

  it('changes nothing when omitted or empty', () => {
    const none = runRentCalculator(calculatorParams(), cases).modernizationPlan;
    const empty = runRentCalculator(calculatorParams({ excludedModernizationIds: [] }), cases).modernizationPlan;
    expect(empty).toEqual(none);
    expect(none.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });
});
```

Append to `apps/web/src/lib/detailCheck/calculatorParamNormalization.test.ts` (use the imports already present in that file; add any missing among `overridesFromParams`, `buildEffectiveCalculatorParams`):

```ts
describe('excludedModernizationIds round-trip', () => {
  it('survives params → overrides → effective params', () => {
    const params = { ...(fixture.params as unknown as CalculatorParams), excludedModernizationIds: ['x'] };
    const overrides = overridesFromParams(params);
    expect(overrides.excludedModernizationIds).toEqual(['x']);
    const rebuilt = buildEffectiveCalculatorParams(params, fieldsFromParams(params), overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: params.rentIncreasePlan,
    });
    expect(rebuilt.excludedModernizationIds).toEqual(['x']);
  });
});
```

(`fixture` and `fieldsFromParams` already exist in that test file; if the fixture import there has a different local name, use that name.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.exclusions.test.ts src/lib/detailCheck/calculatorParamNormalization.test.ts`
Expected: FAIL — unknown field `excludedModernizationIds`.

- [ ] **Step 3: Implement the engine part**

In `CalculatorParams`, directly after `renovationTimingOverrides?: Record<string, RenovationTiming>;`:

```ts
  /**
   * Measures left out of this plan without deselecting them in the Sanierung
   * step — how a selection proposal (SCRUM-96) is shown before it is applied.
   */
  excludedModernizationIds?: string[];
```

Add directly above `function buildPlanFromPlacements(`:

```ts
/** Whether a renovation case takes part in the plan: selected, priced, and not excluded by a proposal. */
function isPlannedCase(params: CalculatorParams, item: RenovationCase): boolean {
  return item.selected && Boolean(item.ai) && !(params.excludedModernizationIds ?? []).includes(item.id);
}
```

In `buildPlanFromPlacements` replace `.filter(({ item }) => item.selected && item.ai)` with `.filter(({ item }) => isPlannedCase(params, item))`.

In `optimizeKnownModernizations` replace `const relevant = renovationCases.filter((item) => item.selected && item.ai);` with `const relevant = renovationCases.filter((item) => isPlannedCase(params, item));`.

- [ ] **Step 4: Implement the normalization part**

In `calculatorParamNormalization.ts`, add to `CalculatorOverrides` after `renovationTimingOverrides`:

```ts
  /** Optional so existing object literals in the calculator page stay valid. */
  excludedModernizationIds?: string[];
```

In `overridesFromParams` add after `renovationTimingOverrides: …,`:

```ts
    excludedModernizationIds: params.excludedModernizationIds ?? [],
```

In `buildEffectiveCalculatorParams`'s returned object add after `renovationTimingOverrides: overrides.renovationTimingOverrides,`:

```ts
    excludedModernizationIds: overrides.excludedModernizationIds ?? [],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.exclusions.test.ts src/lib/detailCheck/calculatorParamNormalization.test.ts src/lib/detailCheck/rentCalculator.parity.test.ts`
Expected: PASS.

Note: the existing idempotency/parity tests in `calculatorParamNormalization.test.ts` compare rebuilt params with `toEqual`. `buildEffectiveCalculatorParams` now always emits `excludedModernizationIds: []`. If one of those tests fails only because of this new key, update its expected object to include `excludedModernizationIds: []` in the same way the file already handles `rentIncreaseOverrides: {}` — and say so in the commit message. Any other difference is a real regression: stop and report.

- [ ] **Step 6: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/rentCalculator.exclusions.test.ts src/lib/detailCheck/calculatorParamNormalization.ts src/lib/detailCheck/calculatorParamNormalization.test.ts
git commit -m "feat(calculator): Override fuer ausgeschlossene Massnahmen (SCRUM-96)

Ein Auswahl-Vorschlag kann Massnahmen weglassen, ohne sie im Sanierungsschritt
abzuwaehlen. Beide Filterstellen (Standardplan und Optimierer) nutzen dafuer
isPlannedCase; der Wert laeuft durch die Normalisierung. Speichern ueber die
API und Zurueckschreiben in den Sanierungsschritt folgen mit Schnitt 4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Objective registry and bit-identical optimizer

The optimizer's goal is hard-wired as "earliest break-even, then highest ending cashflow". It becomes a parameter backed by a registry of lexicographic scores. The existing golden snapshot runs in `DEFAULT` mode and does not exercise the optimizer, so this task first freezes the optimizer's current output, then refactors, then proves bit-identity.

Equivalence of the sort: today `a.breakEvenOffset - b.breakEvenOffset || b.endingCashflow - a.endingCashflow`; the registry compares `[breakEvenOffset, -endingCashflow]` element-wise with `a[i] - b[i]`, and `(-a.end) - (-b.end) === b.end - a.end`. `Array.prototype.sort` is stable, so the order is identical.

**Files:**
- Create: `apps/web/src/lib/detailCheck/analysis/objectives.ts`
- Create: `apps/web/src/lib/detailCheck/analysis/objectives.test.ts`
- Create (generated once): `apps/web/src/lib/detailCheck/__fixtures__/realWorkflowSnapshot.optimized.expected.json`
- Create: `apps/web/src/lib/detailCheck/rentCalculator.optimizerParity.test.ts`
- Modify: `apps/web/src/lib/detailCheck/rentCalculator.ts` (`optimizeKnownModernizations`)

**Interfaces:**
- Consumes: `sustainablyPositiveOffset` from Task 3 (returned by `placementScore` via `buildTimeline`).
- Produces (in `analysis/objectives.ts`):
  - `export type ScoredPlan = { breakEvenOffset: number; endingCashflow: number; sustainablyPositiveOffset: number }`
  - `export type ObjectiveId = 'EARLIEST_BREAK_EVEN' | 'FASTEST_POSITIVE_CASHFLOW'`
  - `export type OptimizationObjective = { id: ObjectiveId; score: (plan: ScoredPlan) => number[] }`
  - `export function compareScores(a: number[], b: number[]): number`
  - `export const EARLIEST_BREAK_EVEN: OptimizationObjective`
  - `export const FASTEST_POSITIVE_CASHFLOW: OptimizationObjective`
  - `export const OBJECTIVES: Record<ObjectiveId, OptimizationObjective>`

- [ ] **Step 1: Freeze today's optimizer output**

Create the temporary generator `apps/web/src/lib/detailCheck/__freezeOptimized.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { runRentCalculator, type CalculatorParams } from './rentCalculator';
import type { RenovationCase } from './renovation';
import fixture from './__fixtures__/realWorkflowSnapshot.json';

it('freezes the optimized plan', () => {
  const params: CalculatorParams = {
    ...(fixture.params as unknown as CalculatorParams),
    placementMode: 'OPTIMIZED',
    mode: 'KNOWN',
    modernizationPlacements: undefined,
    rentIncreasePlan: undefined,
    rentIncreaseOverrides: undefined,
  };
  const result = runRentCalculator(params, fixture.renovationCases as unknown as RenovationCase[]);
  const target = fileURLToPath(new URL('./__fixtures__/realWorkflowSnapshot.optimized.expected.json', import.meta.url));
  writeFileSync(target, `${JSON.stringify({ modernizationPlan: result.modernizationPlan, breakEven: result.breakEven, endingCashflow: result.metrics.endingCashflow }, null, 2)}\n`);
}, 120_000);
```

Run it once on the UNCHANGED optimizer, then delete it:

```bash
npx vitest run src/lib/detailCheck/__freezeOptimized.test.ts && rm src/lib/detailCheck/__freezeOptimized.test.ts
```

Expected: PASS; the JSON file exists and its `modernizationPlan` is non-empty. Do not edit it by hand.

- [ ] **Step 2: Write the parity test (passes now, guards the refactor)**

Create `apps/web/src/lib/detailCheck/rentCalculator.optimizerParity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runRentCalculator, type CalculatorParams } from './rentCalculator';
import type { RenovationCase } from './renovation';
import fixture from './__fixtures__/realWorkflowSnapshot.json';
import expected from './__fixtures__/realWorkflowSnapshot.optimized.expected.json';

/**
 * Golden snapshot of the modernization optimizer on a real workflow, frozen
 * before its objective became pluggable (SCRUM-96). The refactor must leave
 * the default objective's result bit-identical.
 */
describe('optimizer — parity with the frozen pre-registry result', () => {
  it('reproduces the optimized plan, break-even and ending cashflow', () => {
    const params: CalculatorParams = {
      ...(fixture.params as unknown as CalculatorParams),
      placementMode: 'OPTIMIZED',
      mode: 'KNOWN',
      modernizationPlacements: undefined,
      rentIncreasePlan: undefined,
      rentIncreaseOverrides: undefined,
    };
    const result = runRentCalculator(params, fixture.renovationCases as unknown as RenovationCase[]);
    expect(result.modernizationPlan).toEqual(expected.modernizationPlan);
    expect(result.breakEven).toBe(expected.breakEven);
    expect(result.metrics.endingCashflow).toBe(expected.endingCashflow);
  }, 120_000);
});
```

Run: `npx vitest run src/lib/detailCheck/rentCalculator.optimizerParity.test.ts`
Expected: PASS (it compares the unchanged optimizer against its own frozen output).

- [ ] **Step 3: Write the failing registry test**

Create `apps/web/src/lib/detailCheck/analysis/objectives.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareScores, EARLIEST_BREAK_EVEN, FASTEST_POSITIVE_CASHFLOW, OBJECTIVES, type ScoredPlan } from './objectives';

const plan = (breakEvenOffset: number, endingCashflow: number, sustainablyPositiveOffset: number): ScoredPlan =>
  ({ breakEvenOffset, endingCashflow, sustainablyPositiveOffset });

describe('compareScores', () => {
  it('decides on the first differing position', () => {
    expect(compareScores([1, 9], [2, 0])).toBeLessThan(0);
    expect(compareScores([2, 0], [1, 9])).toBeGreaterThan(0);
  });

  it('falls through to the next position on a tie', () => {
    expect(compareScores([1, 3], [1, 5])).toBeLessThan(0);
    expect(compareScores([1, 5], [1, 5])).toBe(0);
  });
});

describe('EARLIEST_BREAK_EVEN', () => {
  it('prefers the earlier break-even, then the higher ending cashflow', () => {
    const sorted = [plan(24, 900, 0), plan(12, 100, 0), plan(12, 500, 0)]
      .sort((a, b) => compareScores(EARLIEST_BREAK_EVEN.score(a), EARLIEST_BREAK_EVEN.score(b)));
    expect(sorted).toEqual([plan(12, 500, 0), plan(12, 100, 0), plan(24, 900, 0)]);
  });

  it('matches the optimizer\'s former comparator exactly', () => {
    const plans = [plan(24, 900, 0), plan(12, 100, 0), plan(12, 500, 0), plan(9999, -Infinity, 0)];
    const former = [...plans].sort((a, b) => a.breakEvenOffset - b.breakEvenOffset || b.endingCashflow - a.endingCashflow);
    const registry = [...plans].sort((a, b) => compareScores(EARLIEST_BREAK_EVEN.score(a), EARLIEST_BREAK_EVEN.score(b)));
    expect(registry).toEqual(former);
  });
});

describe('FASTEST_POSITIVE_CASHFLOW', () => {
  it('prefers the earlier sustainably positive month, then the higher ending cashflow', () => {
    const sorted = [plan(0, 900, 30), plan(0, 100, 10), plan(0, 500, 10)]
      .sort((a, b) => compareScores(FASTEST_POSITIVE_CASHFLOW.score(a), FASTEST_POSITIVE_CASHFLOW.score(b)));
    expect(sorted).toEqual([plan(0, 500, 10), plan(0, 100, 10), plan(0, 900, 30)]);
  });
});

describe('OBJECTIVES', () => {
  it('registers every objective under its own id', () => {
    for (const [id, objective] of Object.entries(OBJECTIVES)) expect(objective.id).toBe(id);
  });
});
```

Run: `npx vitest run src/lib/detailCheck/analysis/objectives.test.ts`
Expected: FAIL — module `./objectives` not found.

- [ ] **Step 4: Implement the registry**

Create `apps/web/src/lib/detailCheck/analysis/objectives.ts`:

```ts
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
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
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
```

Run: `npx vitest run src/lib/detailCheck/analysis/objectives.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the optimizer use the objective**

In `rentCalculator.ts` add to the imports:

```ts
import { compareScores, EARLIEST_BREAK_EVEN, type OptimizationObjective, type ScoredPlan } from './analysis/objectives';
```

Replace the whole body of `optimizeKnownModernizations` with the version below. The signature gains one trailing parameter with a default, so the existing call in `runRentCalculator` needs no change.

```ts
function optimizeKnownModernizations(
  params: CalculatorParams,
  renovationCases: RenovationCase[],
  capAbs: number,
  capPercent: number,
  conservativeRentIndexPerM2: number,
  marketRentIndexPerM2: number,
  objective: OptimizationObjective = EARLIEST_BREAK_EVEN,
) {
  const relevant = renovationCases.filter((item) => isPlannedCase(params, item));
  if (relevant.length === 0) return [];

  type Candidate = { placements: number[]; plan: ModernizationPlanRow[]; score: number[] };
  const scoreOf = (scored: ScoredPlan) => objective.score(scored);
  // The seed stands for "nothing placed yet" and must lose against any real
  // candidate: 9999 months to break-even and an infinitely poor cashflow.
  let candidates: Candidate[] = [{
    placements: [],
    plan: [],
    score: scoreOf({ breakEvenOffset: 9999, endingCashflow: -Infinity, sustainablyPositiveOffset: 9999 }),
  }];
  const possibleOffsets = Array.from(
    { length: Math.floor((CALCULATION_HORIZON_MONTHS - 4) / 12) + 1 },
    (_, index) => 3 + index * 12,
  ).filter((value) => value < CALCULATION_HORIZON_MONTHS);

  for (let index = 0; index < relevant.length; index += 1) {
    const next: Candidate[] = [];
    for (const candidate of candidates) {
      for (const offset of possibleOffsets) {
        const placements = [...candidate.placements, offset];
        const plan = buildPlanFromPlacements(params, relevant.slice(0, index + 1), placements, capAbs);
        const scored = placementScore(params, plan, capPercent, conservativeRentIndexPerM2, marketRentIndexPerM2);
        next.push({ placements, plan, score: scoreOf(scored) });
      }
    }
    next.sort((a, b) => compareScores(a.score, b.score));
    candidates = next.slice(0, 8);
  }

  let best = candidates[0];
  if (!best) return [];

  for (let index = 0; index < relevant.length; index += 1) {
    const nearbyOffsets = [-9, -6, -3, 0, 3, 6, 9]
      .map((delta) => best.placements[index] + delta)
      .filter((offset) => offset >= 3 && offset < CALCULATION_HORIZON_MONTHS);
    for (const offset of nearbyOffsets) {
      const placements = best.placements.map((value, placementIndex) => placementIndex === index ? offset : value);
      const plan = buildPlanFromPlacements(params, relevant, placements, capAbs);
      const score = scoreOf(placementScore(params, plan, capPercent, conservativeRentIndexPerM2, marketRentIndexPerM2));
      // Strictly better only, like before: ties keep the incumbent.
      if (compareScores(score, best.score) < 0) best = { placements, plan, score };
    }
  }

  return best.plan;
}
```

`placementScore` already returns `{ ...buildTimeline(…), breakEvenOffset }`, which after Task 3 contains `breakEvenOffset`, `endingCashflow` and `sustainablyPositiveOffset` — it satisfies `ScoredPlan` structurally. If TypeScript reports a mismatch there, it means Task 3 is missing; do not cast.

- [ ] **Step 6: Run the parity and registry tests**

Run: `npx vitest run src/lib/detailCheck/rentCalculator.optimizerParity.test.ts src/lib/detailCheck/analysis/objectives.test.ts src/lib/detailCheck/rentCalculator.exclusions.test.ts src/lib/detailCheck/rentCalculator.parity.test.ts`
Expected: PASS — in particular the optimizer parity test proves the refactor is bit-identical.

- [ ] **Step 7: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/detailCheck/analysis/objectives.ts src/lib/detailCheck/analysis/objectives.test.ts src/lib/detailCheck/__fixtures__/realWorkflowSnapshot.optimized.expected.json src/lib/detailCheck/rentCalculator.optimizerParity.test.ts src/lib/detailCheck/rentCalculator.ts
git commit -m "refactor(calculator): Zielformel des Optimierers austauschbar, bitgleich (SCRUM-96)

Das Ziel des Modernisierungs-Optimierers war fest verdrahtet (frueher
Break-even, dann Endcashflow). Es kommt jetzt aus einem Register
lexikografischer Scores (analysis/objectives.ts): EARLIEST_BREAK_EVEN als
Standard und FASTEST_POSITIVE_CASHFLOW fuer die Cashflow-Optimierung.

Ein vor dem Umbau eingefrorener Golden-Snapshot des optimierten Plans auf
einem echten Workflow belegt, dass das Standardziel bitgleich rechnet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Not in this cut

- UI inputs for rent-index growth, rent before the last increase and the Betrachtungszeitraum, and their persistence in `detail_check_rent_calculator` (Schnitt 1).
- Persisting excluded measures through the API (POST and GET must change together, otherwise a reload silently drops them) and writing them back into the Sanierung step via the apply dialog (Schnitt 4).
- Exposing a non-default objective through `runRentCalculator` or a worker API (Schnitt 3).
- Known, unchanged limitation: `plan558` starts `current558Base` at `monthlyRentStart`, which includes a §559 increase made before the purchase. §558 Abs. 3 excludes §559 from the cap base. Out of scope here; worth its own ticket.
