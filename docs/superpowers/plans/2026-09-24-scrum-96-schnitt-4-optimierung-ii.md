# SCRUM-96 Schnitt 4 – Optimierung II Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die drei restlichen Ziele im Optimieren-Dropdown freischalten: „Modernisierungsstrategie" (welche Maßnahmen, maximaler ROI), „Kapitalrendite" (maximale EK-Rendite p. a.) und „Empfehlung" (bester Plan über alle Ziele mit Begründung). Vorher: ausgeschlossene Maßnahmen verringern auch Darlehen, Rate und Gesamtinvestition, und der Ausschluss wird gespeichert.

**Architecture:** Alles reine Funktionen in `lib/detailCheck/analysis/` über `runRentCalculator`; die Auswahl-Suche ist zweistufig (alle Teilmengen mit Standard-Zeitpunkten grob bewerten, dann die drei besten zeitlich feinoptimieren). Vorschläge enthalten zusätzlich `excludedModernizationIds`; „Übernehmen" schreibt beides über `commitOverrides`. Laufzeit im vorhandenen Web Worker.

**Tech Stack:** wie Schnitt 3 (Next.js 15, React 19, TypeScript, Vitest node).

## Global Constraints

- Arbeitsverzeichnis `apps/web`; Checks `npm run type-check && npm run lint && npm run test` (`--max-warnings=0`, keine disable-Kommentare).
- Bitgleichheit: ohne `excludedModernizationIds` (oder leer) rechnet die Engine exakt wie heute; Golden-Tests `rentCalculator.parity.test.ts`, `rentCalculator.optimizerParity.test.ts` unverändert grün.
- Finanzierungsanteil der Sanierung: `f = min(1, renovationFinancedAmount / Σ Kosten aller geplanten Maßnahmen)`; je ausgeschlossener Maßnahme sinken `loanAmount` und `totalInvestment` um `f × Kosten`, `monthlyDebtService` proportional zum Darlehen (`× neuesDarlehen / altesDarlehen`). Ohne `renovationFinancedAmount` (0/fehlt) bleibt die Finanzierung unverändert.
- ROI (Spec): `ROI = (CF_Plan(B) − CF_ohne(B)) / Investition`, „ohne" = alle Maßnahmen ausgeschlossen, Investition = Σ `allocableCosts` des Plans; leere Auswahl hat keinen ROI und scheidet für dieses Ziel aus.
- EK-Rendite (Spec): interner Zinsfuß über B aus `−EK` zum Start (EK = `equityAmount`, unabhängig vom Schalter), den monatlichen `afterTaxCashflow` und dem Endwert `Kaufpreis × (1 + g)^B − Restschuld` im letzten Monat von B; `g` = Mietspiegel-Entwicklung `rentIndexGrowthPercent` (Standard 2 %) — als Annahme sichtbar ausweisen. Restschuld = `loanAmount − Σ (debtService − interest)` über B, nicht unter 0. Ausgabe p. a.: `(1 + i_Monat)^12 − 1`.
- Empfehlung (Spec): rechnet die fünf Optimierungen, wählt den Plan mit dem besten `[Break-even-Monat, −CF(H)]` und erzeugt eine Begründung nur aus den Zahlen. Keine KI.
- Teilmengen-Suche nur bis 10 geplante Maßnahmen (1024 Kombinationen); darüber: Hinweis „Zu viele Maßnahmen für die Auswahl-Optimierung (max. 10)" statt Rechnung.
- Keine neuen Abhängigkeiten. Oberfläche Deutsch. Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `src/lib/detailCheck/rentCalculator.ts` | `renovationFinancedAmount?` in Params; Finanzierung nach Ausschlüssen anpassen |
| `src/lib/detailCheck/calculatorParamNormalization.ts` | `renovationFinancedAmount` aus `baseParams` durchreichen |
| `src/app/api/detail-check/calculator/route.ts` | `renovationFinancedAmount` in GET/POST; `excludedModernizationIds` speichern/laden |
| `src/app/property-valuation/detail-check/calculator/page.tsx` | `excludedModernizationIds` im POST-Body; Übernehmen mit Ausschlüssen |
| `src/lib/detailCheck/analysis/metrics.ts` | `equityIrr`, `planRoi` |
| `src/lib/detailCheck/analysis/selection.ts` (neu) | zweistufige Auswahl-Suche |
| `src/lib/detailCheck/analysis/recommend.ts` (neu) | Empfehlung + Begründungstext |
| `src/lib/detailCheck/analysis/optimize.ts` | Vorschlag um Auswahl, ROI, EK-Rendite erweitern; Einstieg je Use Case |
| `src/lib/detailCheck/analysis/catalog.ts` | Schnitt 4 freischalten |
| `calculator/optimizer.worker.ts`, `useOptimization.ts`, `AnalysisPanel.tsx` | neue Ziele, Anzeige ausgeschlossener Maßnahmen, Wiederaufnahme |

---

### Task 1: Ausschluss wirkt auf die Finanzierung und wird gespeichert

**Files:** `rentCalculator.ts`, `calculatorParamNormalization.ts`, `route.ts`, `page.tsx`; Tests `rentCalculator.exclusions.test.ts`, `calculatorParamNormalization.test.ts`.

**Interfaces:**
- `CalculatorParams.renovationFinancedAmount?: number` — Betrag der Sanierung, der im Finanzierungsschritt mitfinanziert ist (Kontext `renovationFinancedAmount` bzw. `financing.*_renovation_costs` der gewählten Variante — denselben Wert, der in `computeFinancing` als `renovationCosts` für die gewählte Variante eingeht).
- `export function financingAfterExclusions(params: CalculatorParams, cases: RenovationCase[]): Pick<CalculatorParams, 'loanAmount' | 'monthlyDebtService' | 'totalInvestment'>` in `rentCalculator.ts`.
- `runRentCalculator` verwendet zu Beginn `params = { ...params, ...financingAfterExclusions(params, cases) }`, **nur** wenn `excludedModernizationIds` nicht leer ist (sonst Objekt unverändert — Bitgleichheit).

- [ ] **Step 1: Failing tests** (an `rentCalculator.exclusions.test.ts` anhängen):

```ts
import { financingAfterExclusions } from './rentCalculator';

describe('financing after exclusions', () => {
  const cases = [renovationCase('a', 10000), renovationCase('b', 30000)];
  const financed = calculatorParams({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000, renovationFinancedAmount: 20000 });

  it('reduces loan, debt service and total investment by the financed share of the excluded cost', () => {
    // f = 20000 / 40000 = 0.5 → excluding b (30000) removes 15000
    const adjusted = financingAfterExclusions({ ...financed, excludedModernizationIds: ['b'] }, cases);
    expect(adjusted.loanAmount).toBe(225000);
    expect(adjusted.totalInvestment).toBe(325000);
    expect(adjusted.monthlyDebtService).toBeCloseTo(1000 * 225000 / 240000, 2);
  });

  it('is a no-op without financed renovation or without exclusions', () => {
    expect(financingAfterExclusions({ ...financed, renovationFinancedAmount: 0, excludedModernizationIds: ['b'] }, cases))
      .toEqual({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000 });
    expect(financingAfterExclusions(financed, cases)).toEqual({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000 });
  });

  it('caps the financed share at 100 % and never goes below zero', () => {
    const adjusted = financingAfterExclusions({ ...financed, renovationFinancedAmount: 90000, loanAmount: 20000, excludedModernizationIds: ['a', 'b'] }, cases);
    expect(adjusted.loanAmount).toBe(0);
    expect(adjusted.monthlyDebtService).toBe(0);
  });

  it('runRentCalculator uses the adjusted financing only when something is excluded', () => {
    const withExclusion = runRentCalculator({ ...financed, excludedModernizationIds: ['b'] }, cases);
    expect(withExclusion.params.loanAmount).toBe(225000);
    const without = runRentCalculator(financed, cases);
    expect(without.params.loanAmount).toBe(240000);
  });
});
```

Kosten je Fall über `costForCase` (so wie die Engine sie nutzt); „geplante Maßnahmen" = Fälle, die ohne Ausschluss `isPlannedCase` erfüllen (prüfe dazu die Umsetzung von `isPlannedCase`/`renovationCase` in `testFixtures.ts`; bei Abweichung die Testzahlen aus den tatsächlichen Kosten ableiten und im Bericht nennen).

Außerdem in `calculatorParamNormalization.test.ts`: `buildEffectiveCalculatorParams` reicht `renovationFinancedAmount` aus `baseParams` unverändert durch; vorhandene Server-Output-Vergleiche um das Feld ergänzen, falls nötig.

- [ ] **Step 2: Implementieren**

```ts
/**
 * Ausgeschlossene Maßnahmen entfallen auch in der Finanzierung: der
 * mitfinanzierte Anteil ihrer Kosten verringert Darlehen und Gesamtinvestition,
 * die Rate sinkt im selben Verhältnis wie das Darlehen (Annuität ist linear im Darlehen).
 */
export function financingAfterExclusions(params: CalculatorParams, cases: RenovationCase[]) {
  const base = { loanAmount: params.loanAmount, monthlyDebtService: params.monthlyDebtService, totalInvestment: params.totalInvestment };
  const excluded = new Set(params.excludedModernizationIds ?? []);
  const financed = Math.max(0, params.renovationFinancedAmount ?? 0);
  if (excluded.size === 0 || financed === 0) return base;
  const planned = cases.filter((item) => isPlannedCase({ ...params, excludedModernizationIds: [] }, item));
  const plannedCost = planned.reduce((sum, item) => sum + costForCase(item), 0);
  if (plannedCost <= 0) return base;
  const share = Math.min(1, financed / plannedCost);
  const removed = planned.filter((item) => excluded.has(item.id)).reduce((sum, item) => sum + costForCase(item), 0) * share;
  const loanAmount = roundCurrency(Math.max(0, params.loanAmount - removed));
  return {
    loanAmount,
    monthlyDebtService: params.loanAmount > 0 ? roundCurrency(params.monthlyDebtService * loanAmount / params.loanAmount) : params.monthlyDebtService,
    totalInvestment: roundCurrency(Math.max(0, params.totalInvestment - removed)),
  };
}
```

(`isPlannedCase`-Signatur prüfen und anpassen.) In `runRentCalculator` ganz am Anfang:

```ts
if ((params.excludedModernizationIds ?? []).length > 0) {
  params = { ...params, ...financingAfterExclusions(params, renovationCases) };
}
```

(Parameter dazu nicht reassignen, falls lint `no-param-reassign` aktiv ist — dann `const effective = …` und im Rest der Funktion verwenden.)

`calculatorParamNormalization.ts` → `buildEffectiveCalculatorParams`: `renovationFinancedAmount: baseParams.renovationFinancedAmount`.

`route.ts`: im Kontext den für die **gewählte** Variante verwendeten Renovierungsbetrag als `renovationFinancedAmount` bereitstellen (offer: `financing?.offer_renovation_costs ?? renovationFinancedAmount`, individual: `financing?.individual_renovation_costs ?? renovationFinancedAmount`) und in GET- und POST-Params setzen. Außerdem `excludedModernizationIds`:
- POST: `excludedModernizationIds: Array.isArray(input.excludedModernizationIds) ? input.excludedModernizationIds.filter((id): id is string => typeof id === 'string') : []`.
- GET: aus `savedParams.excludedModernizationIds` genauso, bei `upstreamIsNewer` → `[]`; im Block `overridesResetByUpstreamChange` einen nicht leeren Ausschluss mit aufnehmen.
- `page.tsx` POST-Body: `excludedModernizationIds: effectiveOverrides.excludedModernizationIds ?? []`.

Prüfe, dass die Fixture/Parität-Tests weiter grün sind (neues Feld bleibt `undefined`, wenn Kontext keinen Wert hat? — nein: der Server setzt immer eine Zahl; in den Server-Output-Vergleichstests das Feld ergänzen).

- [ ] **Step 3: Checks + Commit** — `feat(calculator): Ausschluss senkt Darlehen und Rate, Ausschluss wird gespeichert (SCRUM-96)`.

---

### Task 2: Kennzahlen EK-Rendite und ROI

**Files:** `analysis/metrics.ts`, `analysis/metrics.test.ts`.

**Interfaces:**

```ts
export function remainingDebt(result: RentCalculatorResult, months: number): number;
export function equityIrr(result: RentCalculatorResult, viewPeriodYears: number): number | null; // p. a. als Dezimalzahl (0.05 = 5 %); null wenn EK ≤ 0 oder keine Lösung
export function terminalValue(result: RentCalculatorResult, viewPeriodYears: number): number;
export function planRoi(withPlan: RentCalculatorResult, withoutAny: RentCalculatorResult, viewPeriodYears: number): number | null; // null wenn Investition 0
```

- [ ] **Step 1: Failing tests**

```ts
describe('equity IRR and ROI', () => {
  it('remainingDebt = loan − Σ(debtService − interest), not below zero', () => {
    const result = runRentCalculator(calculatorParams({ loanAmount: 100000, interestRate: 3, repaymentRate: 2, monthlyDebtService: 100000 * 0.05 / 12 }), []);
    const principal = result.timeline.slice(0, 120).reduce((sum, row) => sum + row.debtService - row.interest, 0);
    expect(remainingDebt(result, 120)).toBeCloseTo(100000 - principal, 2);
  });

  it('IRR solves NPV = 0 for the constructed cashflows', () => {
    const params = calculatorParams({ equityAmount: 50000, purchasePrice: 300000, rentIndexGrowthPercent: 2 });
    const result = runRentCalculator(params, []);
    const irr = equityIrr(result, 15)!;
    const monthly = Math.pow(1 + irr, 1 / 12) - 1;
    let npv = -50000;
    result.timeline.slice(0, 180).forEach((row, index) => { npv += row.afterTaxCashflow / Math.pow(1 + monthly, index + 1); });
    npv += terminalValue(result, 15) / Math.pow(1 + monthly, 180);
    expect(Math.abs(npv)).toBeLessThan(1);
  });

  it('terminal value uses purchase price grown by g minus remaining debt', () => {
    const result = runRentCalculator(calculatorParams({ purchasePrice: 300000, rentIndexGrowthPercent: 2 }), []);
    expect(terminalValue(result, 15)).toBeCloseTo(300000 * Math.pow(1.02, 15) - remainingDebt(result, 180), 2);
  });

  it('IRR is null without equity', () => {
    expect(equityIrr(runRentCalculator(calculatorParams({ equityAmount: 0 }), []), 15)).toBeNull();
  });

  it('ROI = ΔCF(B) / investment, null without investment', () => {
    const params = calculatorParams();
    const cases = [renovationCase('a', 10000)];
    const withPlan = runRentCalculator(params, cases);
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases);
    const invest = withPlan.modernizationPlan.reduce((sum, row) => sum + row.allocableCosts, 0);
    expect(planRoi(withPlan, without, 15)).toBeCloseTo((withPlan.timeline[179].cumulativeCashflow - without.timeline[179].cumulativeCashflow) / invest, 6);
    expect(planRoi(without, without, 15)).toBeNull();
  });
});
```

- [ ] **Step 2: Implementieren** — IRR per Bisektion auf den **Monatszins** im Intervall `[-0.99, 1]` (NPV monoton fallend für Standard-Zahlungsreihen); 200 Iterationen oder |NPV| < 0,01; liegt kein Vorzeichenwechsel vor → `null`. Endwert wird im letzten Monat von B zusätzlich zum Cashflow gezahlt. `g` aus `result.params.rentIndexGrowthPercent ?? DEFAULT_RENT_INDEX_GROWTH_PERCENT`.

- [ ] **Step 3: Checks + Commit** — `feat(analysis): EK-Rendite und ROI (SCRUM-96)`.

---

### Task 3: Auswahl-Suche und Empfehlung

**Files:** `analysis/selection.ts` (neu), `analysis/recommend.ts` (neu), `analysis/optimize.ts`, Tests `selection.test.ts`, `recommend.test.ts`, `optimize.test.ts`.

**Interfaces:**

```ts
// selection.ts
export type SelectionGoal = 'MAX_ROI' | 'MAX_EQUITY_IRR';
export const MAX_SELECTION_MEASURES = 10;
export type SelectionResult = { excludedModernizationIds: string[]; placements: Record<string, string>; score: number } | { tooMany: true } | null;
export function optimizeSelection(params: CalculatorParams, cases: RenovationCase[], goal: SelectionGoal): SelectionResult;

// optimize.ts (erweitert)
export type OptimizationGoal = ObjectiveId | SelectionGoal | 'RECOMMENDATION';
export type KeyFigures = { …bisher…, equityIrr: number | null; roi: number | null };
export type OptimizationProposal = { goal: OptimizationGoal; …bisher…; excludedModernizationIds: string[]; excludedTitles: string[]; reasoning?: string[]; chosenGoal?: OptimizationGoal; tooMany?: boolean };
export function runGoal(params: CalculatorParams, cases: RenovationCase[], goal: OptimizationGoal): OptimizationProposal | null;

// recommend.ts
export function recommend(params: CalculatorParams, cases: RenovationCase[]): OptimizationProposal | null;
```

Die bisherige `runOptimization(params, cases, objective)` bleibt als dünner Wrapper (`runGoal` mit `ObjectiveId`) erhalten, damit vorhandene Tests unverändert gelten; `objective`-Feld im Vorschlag wird zu `goal` — alle Verwender anpassen.

- **optimizeSelection:** geplante Maßnahmen `planned` (ohne Ausschluss). Mehr als `MAX_SELECTION_MEASURES` → `{ tooMany: true }`; keine → `null`.
  - Stufe 1: für jede Teilmenge `keep ⊆ planned` (für `MAX_ROI` ohne die leere Menge) einen Lauf `runRentCalculator({ ...params, placementMode: 'DEFAULT', modernizationPlacements: undefined, rentIncreasePlan: undefined, rentIncreaseOverrides: undefined, excludedModernizationIds: planned \ keep })`; Score = ROI (gegen den Lauf „alle ausgeschlossen", einmal gerechnet) bzw. `equityIrr` (null → −∞). Top 3 nach Score.
  - Stufe 2: für jeden der drei `runOptimization` mit `EARLIEST_BREAK_EVEN` auf diesen Ausschluss (Zeitpunkte feinoptimieren); Replay mit den Placements; Score erneut berechnen. Bester gewinnt; bei Gleichstand (|Δ| < 1e-9) der mit früherem Break-even.
  - Ergebnis: Ausschlussliste + Placements (bei leerer Behaltemenge `{}`) + Score.
- **runGoal** für `MAX_ROI`/`MAX_EQUITY_IRR`: baut aus `optimizeSelection` einen Vorschlag wie bisher (before = aktueller Plan, after = Replay mit Ausschluss und Placements, `changes` = verschobene, `excludedTitles` = Titel neu ausgeschlossener Maßnahmen, `improved` = Score nach Ziel strikt besser).
- **recommend:** rechnet `runGoal` für `EARLIEST_BREAK_EVEN`, `MAX_RENT_IN_VIEW`, `FASTEST_POSITIVE_CASHFLOW`, `MAX_ROI`, `MAX_EQUITY_IRR`; wählt den Vorschlag mit dem besten `[Break-even-Offset, −CF(H)]` des `after`-Plans (CF(H) = `metrics.endingCashflow` des Replays — im Vorschlag als `endingCashflow` in `KeyFigures` ergänzen); `goal: 'RECOMMENDATION'`, `chosenGoal` = gewähltes Ziel; `reasoning` = 3–5 deutsche Sätze nur aus Zahlen, z. B. „Break-even 03/2031 statt 08/2033 (29 Monate früher).", „Die Maßnahme Fenster entfällt: Sie holt ihre Kosten im Betrachtungszeitraum nicht herein.", „Kumulierter Cashflow nach 15 Jahren: 84.200 € (+12.300 €).", „Eigenkapitalrendite: 6,1 % p. a. (Annahme Wertsteigerung 2 % p. a.)." Nur Sätze, deren Zahlen vorhanden sind.

- [ ] **Tests (Auszug, vollständig schreiben):**
  - `optimizeSelection` mit zwei Maßnahmen, von denen eine konstruiert unwirtschaftlich ist (sehr teuer, z. B. `renovationCase('x', 500000)`), und einer günstigen: `MAX_ROI` schließt die teure aus.
  - Brute-Force-Vergleich Stufe 1: für 3 Maßnahmen ist der gewählte Score ≥ dem besten Stufe-1-Score aller 7 nicht leeren Teilmengen (unabhängig nachgerechnet).
  - `tooMany` bei 11 Maßnahmen; `null` ohne Maßnahmen.
  - `recommend` wählt den Vorschlag mit minimalem `[breakEvenOffset, −endingCashflow]` unter den fünf (unabhängig nachgerechnet) und liefert ≥ 1 Begründungssatz.
  - Vorhandene `optimize.test.ts`-Tests bleiben grün (ggf. Feldname `goal`).
  - Laufzeit: ein Test, der mit 4 Maßnahmen `recommend` einmal ausführt und < 60 s bleibt (Vitest-Timeout entsprechend setzen); gemessene Zeit in den Bericht.

- [ ] **Checks + Commit** — `feat(analysis): Auswahl-Suche (ROI, EK-Rendite) und Empfehlung (SCRUM-96)`.

---

### Task 4: Oberfläche

**Files:** `catalog.ts` (+Test), `optimizer.worker.ts`, `useOptimization.ts`, `AnalysisPanel.tsx`, `page.tsx`.

- `IMPLEMENTED_SLICES` = `{1, 3, 4}`; `OPTIMIZATION_OBJECTIVE` → umbenennen in `OPTIMIZATION_GOAL: Partial<Record<UseCaseId, OptimizationGoal>>` mit `modernisierungsstrategie: 'MAX_ROI'`, `kapitalrendite: 'MAX_EQUITY_IRR'`, `empfehlung: 'RECOMMENDATION'` zusätzlich. Dropdown-Labels: „Beste Maßnahmen-Auswahl (ROI)", „Höchste Eigenkapitalrendite", „Empfehlung (alle Ziele)".
- Worker und Hook arbeiten mit `runGoal(params, cases, goal)` und `OptimizationGoal`; Laufzeithinweis in der Karte je Ziel: Zeitpunkt-Ziele „ca. 5 Sekunden", Auswahl-Ziele „ca. 15–30 Sekunden", Empfehlung „bis zu 1 Minute".
- Karte:
  - Tabelle vorher/nachher zusätzlich Zeilen „Eigenkapitalrendite p. a." (`x,x %`, „–" bei null) und „ROI der Modernisierung" (`x,x %`), fett je Ziel (MAX_ROI → ROI, MAX_EQUITY_IRR → EK-Rendite, Empfehlung → Break-even).
  - Liste „Nicht durchführen: {Titel}" für `excludedTitles`.
  - Empfehlung: „Gewähltes Ziel: {Dropdown-Label}" und die Begründungssätze als Liste.
  - EK-Rendite-Karte: Hinweis „Annahme: Wertsteigerung {g} % p. a. (Mietspiegel-Entwicklung)".
  - `tooMany` → Tag „Zu viele Maßnahmen" (muted) mit dem Text aus den Global Constraints.
- Übernehmen: `onApplyPlacements(placements, excludedModernizationIds)` → in `page.tsx` `resetRentPlanRef.current = true; commitOverrides({ modernizationPlacements: placements, excludedModernizationIds, rentIncreaseOverrides: {} })`.
- Ausgeschlossene Maßnahmen sichtbar und rückholbar: im Optimieren-Bereich, wenn der aktuelle Plan (`params.excludedModernizationIds`) nicht leer ist, eine Zeile „Ausgeschlossen: {Titel}, …" mit Button „Alle wieder aufnehmen" → `commitOverrides({ excludedModernizationIds: [], modernizationPlacements: {} })` mit `resetRentPlanRef.current = true` (Standardzeitpunkte). Titel aus `cases`.

Checks + Commit — `feat(calculator): Auswahl-Ziele und Empfehlung im Optimieren-Dropdown (SCRUM-96)`.

---

### Task 5 (Controller): Browsertest

Wie Schnitt 3 Task 5, zusätzlich: Auswahl-Ziel übernehmen → Maßnahme verschwindet aus dem Gantt, Darlehen/Rate in den übernommenen Angaben sinken, „Alle wieder aufnehmen" stellt her; Neuladen erhält den Ausschluss.
