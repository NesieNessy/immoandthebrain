# SCRUM-96 Schnitt 1 – Auswertungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unterhalb des Mietkalkulators ein Auswertungs-Panel mit Chips (12 Use Cases, 3 davon in Schnitt 1 aktiv: Break-even, Amortisation, Wirtschaftlichkeit) und Ergebniskarten; dazu die drei neuen Eingaben Mietspiegel-Entwicklung, Miete vor der letzten §558-Erhöhung und Betrachtungszeitraum — gespeichert und in der Live-Vorschau wirksam.

**Architecture:** Alle Kennzahlen sind reine Funktionen in `lib/detailCheck/analysis/` über das Ergebnis von `runRentCalculator` (kein DB-Zugriff, node-testbar). Die Karten-Inhalte (Zeilen, Urteil, Kurvenpunkte) baut ebenfalls eine reine Funktion (`analysis/cards.ts`); die React-Komponente zeigt sie nur an. Die neuen Eingaben laufen über den vorhandenen Weg `CalculatorParameterFields` → `buildEffectiveCalculatorParams` (Browser und Server identisch) und werden wie `last559MonthlyDelta` im JSON `result.params` gespeichert — **keine Migration**.

**Tech Stack:** Next.js 15 / React 19, TypeScript, Vitest (node-Umgebung, keine Komponententests), Tailwind, `@/components/ui`.

## Global Constraints

- Arbeitsverzeichnis `apps/web`; Checks: `npm run type-check && npm run lint && npm run test` (lint mit `--max-warnings=0`).
- Bestehende gespeicherte Workflows ohne die neuen Felder rechnen **bitgleich** wie heute: Mietspiegel-Entwicklung Standard `2` (= `DEFAULT_RENT_INDEX_GROWTH_PERCENT`), `last558RentBefore` Standard `null`, Betrachtungszeitraum hat keinen Einfluss auf die Engine. Die Golden-Tests (`rentCalculator.parity.test.ts`, `rentCalculator.optimizerParity.test.ts`) bleiben unverändert grün.
- `calculatorContextFingerprint` wird **nicht** geändert. Er erfasst nur Daten aus früheren Wizard-Schritten; die neuen Felder sind Kalkulator-eigene Eingaben (wie `last559MonthlyDelta`) und werden über `result.params` gespeichert. (Korrigiert den Hinweis „Kontext-Fingerprint" aus dem Schnitt-0-Review.)
- Betrachtungszeitraum `B`: ganze Jahre, Standard **15**, erlaubt **5–50**.
- Mietspiegel-Entwicklung: % p. a., Standard **2**, erlaubt **−5 bis 10**, leer = Standard.
- „lohnt sich ⟺ `Δ(B) ≥ 0`"; Amortisationsmonat einer Maßnahme = erster Monat **nach der Zahlung** mit `Δ(t) ≥ 0`.
- Amortisation Eigenkapital: erster Monat mit `Σ afterTaxCashflow ≥ equityAmount`. `afterTaxCashflow` enthält die aus dem Cashflow bezahlten Modernisierungen (`renovationPayment`) bereits als Ausgabe; sie werden deshalb nicht zusätzlich auf die Zielgröße addiert. Unabhängig vom Schalter „Eigenkapital berücksichtigen".
- Amortisation Gesamt: erster Monat mit `Σ (rentTotal − nonAllocableCosts − taxes − renovationPayment) ≥ totalInvestment`. `totalInvestment` ist `totalCosts` aus dem Finanzierungsschritt (Kaufpreis + Stellplatz + Nebenkosten + finanzierte Renovierung); Zins und Tilgung werden nicht abgezogen.
- Sprache der Oberfläche: Deutsch. Keine neuen Abhängigkeiten.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `src/lib/detailCheck/rentCalculator.ts` (ändern) | `viewPeriodYears?` im Typ, Konstanten `DEFAULT_VIEW_PERIOD_YEARS` |
| `src/lib/detailCheck/calculatorParamNormalization.ts` (ändern) | Normalisierer + Durchreichen der drei Felder |
| `src/app/api/detail-check/calculator/route.ts` (ändern) | GET liest, POST übernimmt die drei Felder |
| `src/lib/detailCheck/analysis/catalog.ts` (neu) | 12 Use Cases: id, Label, Frage, Gruppe, Schnitt |
| `src/lib/detailCheck/analysis/metrics.ts` (neu) | Break-even-Eckdaten, Amortisation ×2, Wirtschaftlichkeit je Maßnahme |
| `src/lib/detailCheck/analysis/cards.ts` (neu) | Karten-Modelle (Zeilen, Urteil, Kurve) aus den Kennzahlen |
| `src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx` (neu) | Chips + Karten + Mini-Kurve |
| `src/app/property-valuation/detail-check/calculator/page.tsx` (ändern) | Eingabefelder, Speichern, Panel einbinden |

---

### Task 1: Neue Eingaben in Normalisierung und API

**Files:**
- Modify: `src/lib/detailCheck/rentCalculator.ts` (Typ `CalculatorParams`, Konstanten nahe Zeile 21–25)
- Modify: `src/lib/detailCheck/calculatorParamNormalization.ts`
- Modify: `src/app/api/detail-check/calculator/route.ts` (GET-Params ab ca. Zeile 407, POST-Params ab ca. Zeile 507)
- Test: `src/lib/detailCheck/calculatorParamNormalization.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_RENT_INDEX_GROWTH_PERCENT`, `CalculatorParams.rentIndexGrowthPercent?`, `CalculatorParams.last558RentBefore?` (Schnitt 0).
- Produces:
  - `export const DEFAULT_VIEW_PERIOD_YEARS = 15;` in `rentCalculator.ts`; `CalculatorParams.viewPeriodYears?: number` (von der Engine ignoriert).
  - In `calculatorParamNormalization.ts`: `normalizeRentIndexGrowthPercent(value: unknown): number`, `normalizeLast558RentBefore(value: unknown, last558Date: string | null): number | null`, `normalizeViewPeriodYears(value: unknown): number`.
  - `CalculatorParameterFields` bekommt `rentIndexGrowthPercent: string` (Roh-Text, deutsch), `last558RentBefore: string` (Roh-Text), `viewPeriodYears: number`.
  - `buildEffectiveCalculatorParams` setzt `rentIndexGrowthPercent`, `last558RentBefore`, `viewPeriodYears`.

- [ ] **Step 1: Failing tests schreiben** — an `calculatorParamNormalization.test.ts` anhängen:

```ts
import {
  normalizeLast558RentBefore,
  normalizeRentIndexGrowthPercent,
  normalizeViewPeriodYears,
} from './calculatorParamNormalization';

describe('SCRUM-96 Schnitt 1 inputs', () => {
  it('rent index growth: empty/invalid → 2, German decimal parsed, clamped to -5..10', () => {
    expect(normalizeRentIndexGrowthPercent('')).toBe(2);
    expect(normalizeRentIndexGrowthPercent(null)).toBe(2);
    expect(normalizeRentIndexGrowthPercent('abc')).toBe(2);
    expect(normalizeRentIndexGrowthPercent('1,5')).toBe(1.5);
    expect(normalizeRentIndexGrowthPercent(3)).toBe(3);
    expect(normalizeRentIndexGrowthPercent('0')).toBe(0);
    expect(normalizeRentIndexGrowthPercent('25')).toBe(10);
    expect(normalizeRentIndexGrowthPercent(-9)).toBe(-5);
  });

  it('rent before last §558: only with a valid last558Date and a positive amount', () => {
    expect(normalizeLast558RentBefore('950', null)).toBeNull();
    expect(normalizeLast558RentBefore('', '2025-11')).toBeNull();
    expect(normalizeLast558RentBefore('0', '2025-11')).toBeNull();
    expect(normalizeLast558RentBefore('1.234,50', '2025-11')).toBe(1234.5);
    expect(normalizeLast558RentBefore(900, '2025-11')).toBe(900);
  });

  it('view period: integer 5..50, default 15', () => {
    expect(normalizeViewPeriodYears(undefined)).toBe(15);
    expect(normalizeViewPeriodYears('x')).toBe(15);
    expect(normalizeViewPeriodYears(20)).toBe(20);
    expect(normalizeViewPeriodYears(2)).toBe(5);
    expect(normalizeViewPeriodYears(80)).toBe(50);
    expect(normalizeViewPeriodYears(12.6)).toBe(13);
  });
});
```

Außerdem einen Test, dass `buildEffectiveCalculatorParams` die Felder durchreicht. Nutze dieselbe Basis wie die vorhandenen `buildEffectiveCalculatorParams`-Tests in der Datei (dort vorhandene `baseParams`/Felder-Hilfen wiederverwenden; Feldnamen exakt wie unten):

```ts
it('passes the three new inputs through', () => {
  // `base`, `fields`, `overrides` = die in dieser Datei bereits für buildEffectiveCalculatorParams genutzten Werte
  const result = buildEffectiveCalculatorParams(
    base,
    { ...fields, last558Date: '2025-11', rentIndexGrowthPercent: '3,5', last558RentBefore: '900', viewPeriodYears: 20 },
    overrides,
    { resetRentIncreasePlan: false, storedRentIncreasePlan: undefined },
  );
  expect(result.rentIndexGrowthPercent).toBe(3.5);
  expect(result.last558RentBefore).toBe(900);
  expect(result.viewPeriodYears).toBe(20);
});
```

Hinweis: `last558Date` wird von `normalizeRecentMonth(…, 1)` nur akzeptiert, wenn das Jahr ≥ aktuelles Jahr − 1 ist. Liegt `'2025-11'` außerhalb, einen Monat aus dem Vorjahr des Testlaufs verwenden, z. B. `` `${new Date().getFullYear() - 1}-11` ``.

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run src/lib/detailCheck/calculatorParamNormalization.test.ts`
Expected: FAIL (Funktionen nicht exportiert).

- [ ] **Step 3: Implementieren**

In `rentCalculator.ts` neben `DEFAULT_RENT_INDEX_GROWTH_PERCENT`:

```ts
/** Betrachtungszeitraum B der Auswertungen (SCRUM-96); beeinflusst die Engine nicht. */
export const DEFAULT_VIEW_PERIOD_YEARS = 15;
```

und im Typ `CalculatorParams` nach `rentIndexGrowthPercent?`:

```ts
  /** Betrachtungszeitraum der Auswertungen in Jahren; nur gespeichert, von runRentCalculator ignoriert. */
  viewPeriodYears?: number;
```

In `calculatorParamNormalization.ts` (Import um `DEFAULT_RENT_INDEX_GROWTH_PERCENT`, `DEFAULT_VIEW_PERIOD_YEARS` ergänzen):

```ts
/** Parses a stored number or German-locale input text; NaN when empty or unreadable. */
function parseLooseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  if (!/^-?[\d.]*,?\d*$/.test(value.trim())) return Number.NaN;
  return parseDecimalInput(value);
}

/** Mietspiegel-Entwicklung in % p. a.; leer oder unlesbar = Standard 2 %, begrenzt auf −5 … 10. */
export function normalizeRentIndexGrowthPercent(value: unknown): number {
  const parsed = parseLooseNumber(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RENT_INDEX_GROWTH_PERCENT;
  return Math.max(-5, Math.min(10, parsed));
}

/** Miete vor der letzten §558-Erhöhung — nur sinnvoll, wenn deren Datum gesetzt ist. */
export function normalizeLast558RentBefore(value: unknown, last558Date: string | null): number | null {
  if (!last558Date) return null;
  const parsed = parseLooseNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? roundCurrency(parsed) : null;
}

/** Betrachtungszeitraum in ganzen Jahren, 5 … 50, Standard 15. */
export function normalizeViewPeriodYears(value: unknown): number {
  const parsed = Number(value);
  if (value == null || value === '' || !Number.isFinite(parsed)) return DEFAULT_VIEW_PERIOD_YEARS;
  return Math.max(5, Math.min(50, Math.round(parsed)));
}
```

Vor dem Schreiben prüfen, wie `parseDecimalInput` in `acquisitionCosts.ts` negative Zahlen behandelt; falls es das Minus verwirft, in `parseLooseNumber` das Vorzeichen selbst abtrennen und wieder anwenden. Der Test `normalizeRentIndexGrowthPercent(-9)` läuft über den `number`-Zweig; ergänze einen Test `normalizeRentIndexGrowthPercent('-1,5')` → `-1.5`.

`CalculatorParameterFields` erweitern:

```ts
  /** Raw decimal-input text, % p. a.; empty = default 2 %. */
  rentIndexGrowthPercent: string;
  /** Raw decimal-input text, €/Monat; ignored unless `last558Date` is set. */
  last558RentBefore: string;
  viewPeriodYears: number;
```

In `buildEffectiveCalculatorParams` `last558Date` einmal berechnen und wiederverwenden:

```ts
  const last558Date = normalizeRecentMonth(fields.last558Date, 1);
  …
    last558Date,
    last558RentBefore: normalizeLast558RentBefore(fields.last558RentBefore, last558Date),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(fields.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(fields.viewPeriodYears),
```

Die vorhandenen Tests, die das Ergebnis von `buildEffectiveCalculatorParams` gegen echten Server-Output vergleichen, bekommen die drei Felder in der Erwartung ergänzt (`rentIndexGrowthPercent: 2, last558RentBefore: null, viewPeriodYears: 15`) — genauso wie in Schnitt 0 `excludedModernizationIds: []` ergänzt wurde. Übergib in solchen Tests für die neuen Felder `''`, `''`, `15`.

In `route.ts`:
- GET (Objekt `params`, nach `last558Date`):

```ts
    last558RentBefore: normalizeLast558RentBefore(savedParams.last558RentBefore, normalizeRecentMonth(saved?.last_558_date, 1)),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(savedParams.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(savedParams.viewPeriodYears),
```

- POST (Objekt `params`, nach `last558Date`):

```ts
    last558RentBefore: normalizeLast558RentBefore(input.last558RentBefore, normalizeRecentMonth(input.last558Date, 1)),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(input.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(input.viewPeriodYears),
```

Imports der drei Normalisierer ergänzen. Prüfe, dass `resultForStorage` `params` vollständig speichert (dann landen die Felder in `result.params` und GET liest sie über `savedParams`). Falls `resultForStorage` Felder einzeln auswählt, die drei dort ergänzen. Den Typ von `input` (POST-Body) um die drei optionalen Felder erweitern, falls er typisiert ist.

- [ ] **Step 4: Tests grün**

Run: `npx vitest run src/lib/detailCheck` → PASS; danach `npm run type-check && npm run lint && npm run test` → alles grün (Golden-Tests unverändert).

- [ ] **Step 5: Commit**

```bash
git add src/lib/detailCheck/rentCalculator.ts src/lib/detailCheck/calculatorParamNormalization.ts src/lib/detailCheck/calculatorParamNormalization.test.ts src/app/api/detail-check/calculator/route.ts
git commit -m "feat(calculator): Mietspiegel-Entwicklung, Miete vor §558 und Betrachtungszeitraum speichern (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Eingabefelder auf der Kalkulatorseite

**Files:**
- Modify: `src/app/property-valuation/detail-check/calculator/page.tsx`

**Interfaces:**
- Consumes: `CalculatorParameterFields` mit `rentIndexGrowthPercent: string`, `last558RentBefore: string`, `viewPeriodYears: number` (Task 1); `DEFAULT_VIEW_PERIOD_YEARS`.
- Produces: gespeicherte Werte; `viewPeriodYears` steht in `effectiveParams.viewPeriodYears` für Task 5 bereit.

Keine automatisierten Tests (keine Komponententests im Projekt); Nachweis über Typprüfung und Browser.

- [ ] **Step 1: State und Felder** — in `CalculatorContent` neben `last558Date`:

```ts
  const [last558RentBefore, setLast558RentBefore] = useState('');
  const [rentIndexGrowthPercent, setRentIndexGrowthPercent] = useState('');
  const [viewPeriodYears, setViewPeriodYears] = useState(DEFAULT_VIEW_PERIOD_YEARS);
```

`parameterFields`-`useMemo` um die drei Werte erweitern (Objekt und Abhängigkeitsliste). `parameterFieldsFromParams` (ca. Zeile 117):

```ts
    last558RentBefore: params.last558RentBefore == null ? '' : valueString(params.last558RentBefore),
    rentIndexGrowthPercent: params.rentIndexGrowthPercent == null ? '' : valueString(params.rentIndexGrowthPercent),
    viewPeriodYears: params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS,
```

Beim Laden (`load()`, dort wo `setLast558Date(loaded.params.last558Date ?? '')` steht) dieselben drei Werte setzen, und im zweiten Objekt an derselben Stelle (ca. Zeile 1755, das `last558Date: loaded.params.last558Date ?? ''` enthält) ebenso ergänzen. Prüfe, ob `valueString` deutsches Format liefert; wenn nicht, dasselbe Format wie für `last559MonthlyDelta` beim Laden verwenden.

- [ ] **Step 2: Speichern** — im POST-Body von `recalc` nach `last558Date`:

```ts
          last558RentBefore: last558Date && last558RentBefore !== '' ? parseDecimalInput(last558RentBefore) : null,
          rentIndexGrowthPercent: rentIndexGrowthPercent === '' ? null : parseDecimalInput(rentIndexGrowthPercent),
          viewPeriodYears,
```

In der Autosave-Signatur (`const signature = JSON.stringify({ … })`) und deren Abhängigkeitsliste die drei Werte ergänzen.

- [ ] **Step 3: Eingaben im Parameter-Raster** (Abschnitt „Parameter", nach dem Feld „Letzte Mieterhöhung §558"):

```tsx
<TextField label="Miete vor der letzten §558-Erhöhung" optional value={last558RentBefore} suffix="€/Monat" inputMode="decimal" disabled={!last558Date} onChange={(event) => setLast558RentBefore(event.target.value)} helperText="Die Erhöhung zählt dann im Dreijahresfenster der Kappungsgrenze mit." />
```

nach „Mietspiegel Vergleichswert":

```tsx
<TextField label="Mietspiegel-Entwicklung" optional value={rentIndexGrowthPercent} suffix="% p. a." inputMode="decimal" placeholder="2" onChange={(event) => setRentIndexGrowthPercent(event.target.value)} helperText="Leer = 2 % pro Jahr." />
```

Den Betrachtungszeitraum setzt Task 5 im Auswertungs-Panel. Prüfe, ob `TextField` `placeholder` unterstützt; sonst weglassen.

- [ ] **Step 4: Checks + Browser**

`npm run type-check && npm run lint && npm run test` grün. Im Browser (`localhost`, Detailbewertung → Kalkulator eines vorhandenen Workflows): Mietspiegel-Entwicklung „0" eintragen → Kennzahl „Break-even mit Mietspiegel" ändert sich; Seite neu laden → Wert bleibt. Leeres Feld → gleiche Zahlen wie vor der Änderung.

- [ ] **Step 5: Commit**

```bash
git add src/app/property-valuation/detail-check/calculator/page.tsx
git commit -m "feat(calculator): Eingaben Mietspiegel-Entwicklung und Miete vor §558 (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kennzahlen (Break-even, Amortisation, Wirtschaftlichkeit)

**Files:**
- Create: `src/lib/detailCheck/analysis/metrics.ts`
- Test: `src/lib/detailCheck/analysis/metrics.test.ts`

**Interfaces:**
- Consumes: `runRentCalculator`, `CalculatorParams`, `RentTimelineRow`, `addMonths` aus `../rentCalculator`; `RenovationCase` aus `../renovation`.
- Produces:

```ts
export type RentCalculatorResult = ReturnType<typeof runRentCalculator>;
export type MonthPoint = { month: string | null; years: number | null };
export type BreakEvenFacts = MonthPoint & { troughAmount: number; troughMonth: string | null; withRentIndex: MonthPoint };
export type MeasureEconomics = {
  id: string; title: string; costs: number; monthlyDelta: number; capUsePercent: number;
  paymentMonth: string; deltaAtViewEnd: number; worthIt: boolean; paybackMonth: string | null;
  delta: number[]; // Δ(t) je Monat bis Ende B
};
export function viewEndIndex(viewPeriodYears: number): number;
export function breakEvenFacts(result: RentCalculatorResult): BreakEvenFacts;
export function equityPayback(result: RentCalculatorResult): MonthPoint;
export function totalPayback(result: RentCalculatorResult): MonthPoint;
export function measureEconomics(params: CalculatorParams, cases: RenovationCase[], viewPeriodYears: number): MeasureEconomics[];
```

- [ ] **Step 1: Failing tests** — `metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { breakEvenFacts, equityPayback, measureEconomics, totalPayback, viewEndIndex } from './metrics';

describe('analysis metrics', () => {
  it('viewEndIndex is the last month of B', () => {
    expect(viewEndIndex(15)).toBe(179);
  });

  it('break-even facts match the timeline and report the trough', () => {
    const result = runRentCalculator(calculatorParams({ equityIncluded: true, equityAmount: 50000 }), []);
    const facts = breakEvenFacts(result);
    expect(facts.month).toBe(result.breakEven);
    const trough = Math.min(...result.timeline.map((row) => row.cumulativeCashflow));
    expect(facts.troughAmount).toBe(trough);
    expect(facts.troughMonth).toBe(result.timeline.find((row) => row.cumulativeCashflow === trough)?.yyyymm);
    expect(facts.withRentIndex.month).toBe(result.breakEvenWithRentIndex);
  });

  it('equity payback: first month where the summed after-tax cashflow covers the equity', () => {
    const result = runRentCalculator(calculatorParams({ equityAmount: 12000 }), []);
    const payback = equityPayback(result);
    let sum = 0;
    const index = result.timeline.findIndex((row) => (sum += row.afterTaxCashflow) >= 12000);
    expect(payback.month).toBe(result.timeline[index].yyyymm);
    expect(payback.years).toBeCloseTo((index + 1) / 12, 5);
  });

  it('equity payback ignores the equityIncluded switch', () => {
    const a = equityPayback(runRentCalculator(calculatorParams({ equityAmount: 12000, equityIncluded: false }), []));
    const b = equityPayback(runRentCalculator(calculatorParams({ equityAmount: 12000, equityIncluded: true }), []));
    expect(a).toEqual(b);
  });

  it('total payback does not deduct debt service', () => {
    const noDebt = totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 120000 }), []));
    const withDebt = totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 120000, monthlyDebtService: 900 }), []));
    expect(withDebt.month).toBe(noDebt.month);
    expect(noDebt.month).not.toBeNull();
  });

  it('payback is null when never reached within the horizon', () => {
    expect(totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 1e12 }), [])).month).toBeNull();
  });

  it('measure economics: Δ = with − without, verdict at the end of B', () => {
    const params = calculatorParams();
    const cases = [renovationCase('a', 10000)];
    const [row] = measureEconomics(params, cases, 15);
    const withPlan = runRentCalculator(params, cases).timeline;
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases).timeline;
    const end = viewEndIndex(15);
    expect(row.id).toBe('a');
    expect(row.deltaAtViewEnd).toBeCloseTo(withPlan[end].cumulativeCashflow - without[end].cumulativeCashflow, 2);
    expect(row.worthIt).toBe(row.deltaAtViewEnd >= 0);
    expect(row.delta).toHaveLength(end + 1);
    if (row.paybackMonth) expect(row.paybackMonth > row.paymentMonth).toBe(true);
  });

  it('measure economics skips measures that are not in the plan (e.g. excluded)', () => {
    const rows = measureEconomics(calculatorParams({ excludedModernizationIds: ['a'] }), [renovationCase('a', 10000)], 15);
    expect(rows).toEqual([]);
  });
});
```

Vor dem Schreiben `testFixtures.ts` prüfen: Wenn `renovationCase` einen Fall erzeugt, der im Standardplan keine §559-Mehrmiete ergibt, im Test trotzdem nur die obigen Beziehungen prüfen (sie gelten allgemein).

- [ ] **Step 2: Test muss fehlschlagen** — `npx vitest run src/lib/detailCheck/analysis/metrics.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `metrics.ts`:

```ts
import { runRentCalculator, type CalculatorParams, type RentTimelineRow } from '../rentCalculator';
import type { RenovationCase } from '../renovation';

/**
 * Kennzahlen der Auswertungen (SCRUM-96, Schnitt 1). Reine Funktionen über
 * dem Ergebnis von runRentCalculator — keine eigene Rechenlogik für Miete,
 * Steuern oder Finanzierung.
 */

export type RentCalculatorResult = ReturnType<typeof runRentCalculator>;
export type MonthPoint = { month: string | null; years: number | null };
export type BreakEvenFacts = MonthPoint & { troughAmount: number; troughMonth: string | null; withRentIndex: MonthPoint };
export type MeasureEconomics = {
  id: string;
  title: string;
  costs: number;
  monthlyDelta: number;
  /** Anteil der §559-Mehrmiete am absoluten Deckel, in %. */
  capUsePercent: number;
  paymentMonth: string;
  deltaAtViewEnd: number;
  worthIt: boolean;
  paybackMonth: string | null;
  delta: number[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Index des letzten Monats im Betrachtungszeitraum. */
export function viewEndIndex(viewPeriodYears: number): number {
  return viewPeriodYears * 12 - 1;
}

function pointAt(timeline: RentTimelineRow[], index: number): MonthPoint {
  return index < 0 ? { month: null, years: null } : { month: timeline[index].yyyymm, years: (index + 1) / 12 };
}

function monthPoint(timeline: RentTimelineRow[], month: string | null): MonthPoint {
  return pointAt(timeline, month == null ? -1 : timeline.findIndex((row) => row.yyyymm === month));
}

/** Erster Index, an dem die laufende Summe von `step` die Zielgröße erreicht. */
function firstCumulativeReach(timeline: RentTimelineRow[], target: number, step: (row: RentTimelineRow) => number): number {
  let sum = 0;
  return timeline.findIndex((row) => (sum += step(row)) >= target);
}

export function breakEvenFacts(result: RentCalculatorResult): BreakEvenFacts {
  const { timeline } = result;
  let troughIndex = -1;
  timeline.forEach((row, index) => {
    if (troughIndex < 0 || row.cumulativeCashflow < timeline[troughIndex].cumulativeCashflow) troughIndex = index;
  });
  return {
    ...monthPoint(timeline, result.breakEven),
    troughAmount: troughIndex < 0 ? 0 : timeline[troughIndex].cumulativeCashflow,
    troughMonth: troughIndex < 0 ? null : timeline[troughIndex].yyyymm,
    withRentIndex: monthPoint(timeline, result.breakEvenWithRentIndex),
  };
}

/** Σ Cashflow nach Steuern ≥ eingesetztes Eigenkapital (unabhängig vom Schalter „Eigenkapital berücksichtigen"). */
export function equityPayback(result: RentCalculatorResult): MonthPoint {
  const equity = Math.max(0, result.params.equityAmount ?? 0);
  return pointAt(result.timeline, firstCumulativeReach(result.timeline, equity, (row) => row.afterTaxCashflow));
}

/** Σ (Miete − nicht umlagefähige Kosten − Steuern − Modernisierungszahlung) ≥ Gesamtinvestition; ohne Zins und Tilgung. */
export function totalPayback(result: RentCalculatorResult): MonthPoint {
  const target = Math.max(0, result.params.totalInvestment);
  return pointAt(
    result.timeline,
    firstCumulativeReach(result.timeline, target, (row) => row.rentTotal - row.nonAllocableCosts - row.taxes - row.renovationPayment),
  );
}

/** Δ(t) = CF_mit(t) − CF_ohne(t) je geplanter Maßnahme; lohnt sich ⟺ Δ(B) ≥ 0. */
export function measureEconomics(params: CalculatorParams, cases: RenovationCase[], viewPeriodYears: number): MeasureEconomics[] {
  const withResult = runRentCalculator(params, cases);
  const end = Math.min(viewEndIndex(viewPeriodYears), withResult.timeline.length - 1);
  const excluded = params.excludedModernizationIds ?? [];
  return withResult.modernizationPlan.map((item) => {
    const without = runRentCalculator({ ...params, excludedModernizationIds: [...excluded, item.id] }, cases).timeline;
    const delta = withResult.timeline
      .slice(0, end + 1)
      .map((row, index) => round2(row.cumulativeCashflow - without[index].cumulativeCashflow));
    const paybackIndex = delta.findIndex((value, index) => withResult.timeline[index].yyyymm > item.paymentYyyymm && value >= 0);
    const deltaAtViewEnd = delta[end] ?? 0;
    return {
      id: item.id,
      title: item.title,
      costs: item.allocableCosts,
      monthlyDelta: item.monthlyDelta,
      capUsePercent: withResult.capAbs > 0 ? round2((item.monthlyDelta / withResult.capAbs) * 100) : 0,
      paymentMonth: item.paymentYyyymm,
      deltaAtViewEnd,
      worthIt: deltaAtViewEnd >= 0,
      paybackMonth: paybackIndex < 0 ? null : withResult.timeline[paybackIndex].yyyymm,
      delta,
    };
  });
}
```

Hinweis zu Plan-Zeitpunkten: In `params.modernizationPlacements` fixierte Zeitpunkte bleiben beim „ohne"-Lauf gleich; ohne fixierte Zeitpunkte verteilt der Standardplan die übrigen Maßnahmen eventuell neu — das ist gewollt (so sähe der Plan ohne die Maßnahme tatsächlich aus).

- [ ] **Step 4: Tests grün** — `npx vitest run src/lib/detailCheck/analysis` → PASS, dann `npm run type-check && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/detailCheck/analysis/metrics.ts src/lib/detailCheck/analysis/metrics.test.ts
git commit -m "feat(analysis): Kennzahlen Break-even, Amortisation und Wirtschaftlichkeit (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Use-Case-Katalog und Karten-Modelle

**Files:**
- Create: `src/lib/detailCheck/analysis/catalog.ts`
- Create: `src/lib/detailCheck/analysis/cards.ts`
- Test: `src/lib/detailCheck/analysis/catalog.test.ts`, `src/lib/detailCheck/analysis/cards.test.ts`

**Interfaces:**
- Consumes: Task 3 (`breakEvenFacts`, `equityPayback`, `totalPayback`, `measureEconomics`, `viewEndIndex`, `RentCalculatorResult`, `MeasureEconomics`).
- Produces:

```ts
// catalog.ts
export type UseCaseGroup = 'auswertung' | 'simulation' | 'optimierung';
export type UseCaseId =
  | 'break-even' | 'amortisation' | 'wirtschaftlichkeit'
  | 'investitionssimulation' | 'optimale-hoehe' | 'szenarien'
  | 'optimaler-zeitpunkt' | 'mieterhoehungsstrategie' | 'cashflow-optimierung'
  | 'modernisierungsstrategie' | 'kapitalrendite' | 'empfehlung';
export type UseCase = { id: UseCaseId; label: string; question: string; group: UseCaseGroup; availableFromSlice: 1 | 2 | 3 | 4 };
export const USE_CASES: UseCase[];
export const CURRENT_SLICE = 1;
export function isAvailable(useCase: UseCase): boolean;
export const USE_CASE_GROUP_LABELS: Record<UseCaseGroup, string>;

// cards.ts
export type CardVerdict = { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' };
export type CardRow = { label: string; value: string };
export type CardSeries = { values: number[]; markerIndex: number | null };
export type AnalysisCard = { id: string; title: string; verdict: CardVerdict; rows: CardRow[]; series: CardSeries | null; note?: string };
export function buildAnalysisCards(input: {
  selected: UseCaseId[]; result: RentCalculatorResult; params: CalculatorParams; cases: RenovationCase[]; viewPeriodYears: number;
}): AnalysisCard[];
```

- [ ] **Step 1: Failing tests**

`catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { USE_CASES, isAvailable } from './catalog';

describe('use case catalog', () => {
  it('lists twelve unique use cases', () => {
    expect(USE_CASES).toHaveLength(12);
    expect(new Set(USE_CASES.map((item) => item.id)).size).toBe(12);
  });

  it('slice 1 enables exactly break-even, amortisation and wirtschaftlichkeit', () => {
    expect(USE_CASES.filter(isAvailable).map((item) => item.id)).toEqual(['break-even', 'amortisation', 'wirtschaftlichkeit']);
  });

  it('every use case carries a question for the tooltip', () => {
    for (const item of USE_CASES) expect(item.question.endsWith('?')).toBe(true);
  });
});
```

`cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { buildAnalysisCards } from './cards';
import { viewEndIndex } from './metrics';

const params = calculatorParams({ equityAmount: 12000, totalInvestment: 120000 });
const cases = [renovationCase('a', 10000)];
const result = runRentCalculator(params, cases);
const build = (selected: Parameters<typeof buildAnalysisCards>[0]['selected'], viewPeriodYears = 15) =>
  buildAnalysisCards({ selected, result, params, cases, viewPeriodYears });

describe('analysis cards', () => {
  it('returns cards in catalog order, only for selected and available use cases', () => {
    expect(build(['wirtschaftlichkeit', 'break-even', 'kapitalrendite']).map((card) => card.id))
      .toEqual(['break-even', 'wirtschaftlichkeit:a']);
  });

  it('break-even card: series is the cumulative cashflow up to B, marker at break-even', () => {
    const [card] = build(['break-even'], 10);
    expect(card.series?.values).toHaveLength(viewEndIndex(10) + 1);
    const index = result.timeline.findIndex((row) => row.yyyymm === result.breakEven);
    expect(card.series?.markerIndex).toBe(index >= 0 && index <= viewEndIndex(10) ? index : null);
    expect(card.verdict.tone).toBe(index >= 0 && index <= viewEndIndex(10) ? 'success' : 'warning');
  });

  it('amortisation card has an equity row and a total row', () => {
    const [card] = build(['amortisation']);
    expect(card.rows.map((row) => row.label)).toEqual(expect.arrayContaining(['Eigenkapital zurück', 'Gesamtinvestition zurück']));
  });

  it('one wirtschaftlichkeit card per planned measure with verdict lohnt sich / lohnt sich nicht', () => {
    const cards = build(['wirtschaftlichkeit']);
    expect(cards).toHaveLength(result.modernizationPlan.length);
    for (const card of cards) expect(['Lohnt sich', 'Lohnt sich nicht']).toContain(card.verdict.label);
  });

  it('wirtschaftlichkeit without planned measures yields one muted hint card', () => {
    const cards = buildAnalysisCards({ selected: ['wirtschaftlichkeit'], result: runRentCalculator(params, []), params, cases: [], viewPeriodYears: 15 });
    expect(cards).toHaveLength(1);
    expect(cards[0].verdict.tone).toBe('muted');
  });
});
```

- [ ] **Step 2: Tests müssen fehlschlagen** — `npx vitest run src/lib/detailCheck/analysis` → FAIL.

- [ ] **Step 3: Implementieren**

`catalog.ts`:

```ts
/** Die zwölf Analyse-Use-Cases aus SCRUM-96; `availableFromSlice` steuert, ab welchem Schnitt ein Chip aktiv ist. */
export type UseCaseGroup = 'auswertung' | 'simulation' | 'optimierung';
export type UseCaseId =
  | 'break-even' | 'amortisation' | 'wirtschaftlichkeit'
  | 'investitionssimulation' | 'optimale-hoehe' | 'szenarien'
  | 'optimaler-zeitpunkt' | 'mieterhoehungsstrategie' | 'cashflow-optimierung'
  | 'modernisierungsstrategie' | 'kapitalrendite' | 'empfehlung';
export type UseCase = { id: UseCaseId; label: string; question: string; group: UseCaseGroup; availableFromSlice: 1 | 2 | 3 | 4 };

export const CURRENT_SLICE = 1;

export const USE_CASE_GROUP_LABELS: Record<UseCaseGroup, string> = {
  auswertung: 'Auswertungen',
  simulation: 'Simulationen',
  optimierung: 'Optimierungen',
};

export const USE_CASES: UseCase[] = [
  { id: 'break-even', label: 'Break-even', question: 'Ab wann ist die Investition kumuliert im Plus?', group: 'auswertung', availableFromSlice: 1 },
  { id: 'amortisation', label: 'Amortisation', question: 'Wann ist das eingesetzte Kapital zurückgeflossen?', group: 'auswertung', availableFromSlice: 1 },
  { id: 'wirtschaftlichkeit', label: 'Wirtschaftlichkeit', question: 'Lohnt sich die einzelne Modernisierung?', group: 'auswertung', availableFromSlice: 1 },
  { id: 'investitionssimulation', label: 'Investitionssimulation', question: 'Wie verändert sich das Ergebnis bei mehr oder weniger Investition?', group: 'simulation', availableFromSlice: 2 },
  { id: 'optimale-hoehe', label: 'Optimale Modernisierungshöhe', question: 'Wie viel Modernisierung ist wirtschaftlich sinnvoll?', group: 'simulation', availableFromSlice: 2 },
  { id: 'szenarien', label: 'Szenarioanalyse', question: 'Wie schneiden verschiedene Modernisierungsszenarien im Vergleich ab?', group: 'simulation', availableFromSlice: 2 },
  { id: 'optimaler-zeitpunkt', label: 'Optimaler Zeitpunkt', question: 'Wann sollten die Modernisierungen stattfinden?', group: 'optimierung', availableFromSlice: 3 },
  { id: 'mieterhoehungsstrategie', label: 'Mieterhöhungsstrategie', question: 'Wie hole ich rechtssicher die höchste Miete heraus?', group: 'optimierung', availableFromSlice: 3 },
  { id: 'cashflow-optimierung', label: 'Cashflow-Optimierung', question: 'Wie wird der monatliche Cashflow am schnellsten dauerhaft positiv?', group: 'optimierung', availableFromSlice: 3 },
  { id: 'modernisierungsstrategie', label: 'Modernisierungsstrategie', question: 'Welche Kombination von Maßnahmen bringt am meisten?', group: 'optimierung', availableFromSlice: 4 },
  { id: 'kapitalrendite', label: 'Kapitalrendite', question: 'Wie erreiche ich die höchste Eigenkapitalrendite?', group: 'optimierung', availableFromSlice: 4 },
  { id: 'empfehlung', label: 'Empfehlung', question: 'Welche Strategie ist insgesamt zu empfehlen?', group: 'optimierung', availableFromSlice: 4 },
];

export function isAvailable(useCase: UseCase): boolean {
  return useCase.availableFromSlice <= CURRENT_SLICE;
}
```

`cards.ts`:

```ts
import type { CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { USE_CASES, isAvailable, type UseCaseId } from './catalog';
import { breakEvenFacts, equityPayback, measureEconomics, totalPayback, viewEndIndex, type MonthPoint, type RentCalculatorResult } from './metrics';

export type CardVerdict = { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' };
export type CardRow = { label: string; value: string };
export type CardSeries = { values: number[]; markerIndex: number | null };
export type AnalysisCard = { id: string; title: string; verdict: CardVerdict; rows: CardRow[]; series: CardSeries | null; note?: string };

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

function formatMonth(month: string | null): string {
  if (!month) return 'nicht erreicht';
  const [year, mm] = month.split('-');
  return `${mm}/${year}`;
}

function formatPoint(point: MonthPoint): string {
  return point.month ? `${formatMonth(point.month)} (${decimal.format(point.years ?? 0)} Jahre)` : 'nicht erreicht';
}

function withinView(point: MonthPoint, viewPeriodYears: number): boolean {
  return point.years != null && point.years <= viewPeriodYears;
}

export function buildAnalysisCards(input: {
  selected: UseCaseId[];
  result: RentCalculatorResult;
  params: CalculatorParams;
  cases: RenovationCase[];
  viewPeriodYears: number;
}): AnalysisCard[] {
  const { selected, result, params, cases, viewPeriodYears } = input;
  const end = Math.min(viewEndIndex(viewPeriodYears), result.timeline.length - 1);
  const cumulative = result.timeline.slice(0, end + 1).map((row) => row.cumulativeCashflow);
  const cards: AnalysisCard[] = [];

  for (const useCase of USE_CASES) {
    if (!selected.includes(useCase.id) || !isAvailable(useCase)) continue;

    if (useCase.id === 'break-even') {
      const facts = breakEvenFacts(result);
      const index = facts.month ? result.timeline.findIndex((row) => row.yyyymm === facts.month) : -1;
      const reached = withinView(facts, viewPeriodYears);
      cards.push({
        id: 'break-even',
        title: 'Break-even',
        verdict: reached ? { label: 'Im Betrachtungszeitraum', tone: 'success' } : { label: 'Nicht im Betrachtungszeitraum', tone: 'warning' },
        rows: [
          { label: 'Break-even', value: formatPoint(facts) },
          { label: 'Mit Mietspiegel', value: formatPoint(facts.withRentIndex) },
          { label: 'Tiefpunkt', value: `${currency.format(facts.troughAmount)} (${formatMonth(facts.troughMonth)})` },
        ],
        series: { values: cumulative, markerIndex: index >= 0 && index <= end ? index : null },
      });
    }

    if (useCase.id === 'amortisation') {
      const equity = equityPayback(result);
      const total = totalPayback(result);
      const equityReached = withinView(equity, viewPeriodYears);
      cards.push({
        id: 'amortisation',
        title: 'Amortisation',
        verdict: equityReached ? { label: 'Eigenkapital im Zeitraum zurück', tone: 'success' } : { label: 'Eigenkapital nicht im Zeitraum zurück', tone: 'warning' },
        rows: [
          { label: 'Eigenkapital zurück', value: formatPoint(equity) },
          { label: 'Gesamtinvestition zurück', value: formatPoint(total) },
          { label: 'Eigenkapital', value: currency.format(result.params.equityAmount ?? 0) },
          { label: 'Gesamtinvestition', value: currency.format(result.params.totalInvestment) },
        ],
        series: null,
        note: 'Gesamt: Miete abzüglich nicht umlagefähiger Kosten, Steuern und Modernisierung — ohne Zins und Tilgung.',
      });
    }

    if (useCase.id === 'wirtschaftlichkeit') {
      const measures = measureEconomics(params, cases, viewPeriodYears);
      if (measures.length === 0) {
        cards.push({ id: 'wirtschaftlichkeit', title: 'Wirtschaftlichkeit', verdict: { label: 'Keine Maßnahme geplant', tone: 'muted' }, rows: [], series: null });
      }
      for (const measure of measures) {
        cards.push({
          id: `wirtschaftlichkeit:${measure.id}`,
          title: `Wirtschaftlichkeit – ${measure.title}`,
          verdict: measure.worthIt ? { label: 'Lohnt sich', tone: 'success' } : { label: 'Lohnt sich nicht', tone: 'danger' },
          rows: [
            { label: 'Kosten', value: currency.format(measure.costs) },
            { label: '§559-Mehrmiete', value: `${currency.format(measure.monthlyDelta)} / Monat` },
            { label: 'Deckel ausgeschöpft', value: `${decimal.format(measure.capUsePercent)} %` },
            { label: `Vorteil nach ${viewPeriodYears} Jahren`, value: currency.format(measure.deltaAtViewEnd) },
            { label: 'Amortisiert', value: formatMonth(measure.paybackMonth) },
          ],
          series: { values: measure.delta, markerIndex: null },
        });
      }
    }
  }
  return cards;
}
```

- [ ] **Step 4: Tests grün** — `npx vitest run src/lib/detailCheck/analysis` → PASS; `npm run type-check && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/detailCheck/analysis/catalog.ts src/lib/detailCheck/analysis/catalog.test.ts src/lib/detailCheck/analysis/cards.ts src/lib/detailCheck/analysis/cards.test.ts
git commit -m "feat(analysis): Use-Case-Katalog und Karten-Modelle (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Auswertungs-Panel auf der Kalkulatorseite

**Files:**
- Create: `src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx`
- Modify: `src/app/property-valuation/detail-check/calculator/page.tsx` (Import; Panel zwischen der Section `order-2` und der Section `order-3` „Detailtabellen"; `viewPeriodYears`-State aus Task 2)

**Interfaces:**
- Consumes: `buildAnalysisCards`, `AnalysisCard`, `USE_CASES`, `USE_CASE_GROUP_LABELS`, `isAvailable`, `UseCaseId` (Task 4); `presented` (Ergebnis), `effectiveParams`, `data.renovationCases`, `viewPeriodYears`/`setViewPeriodYears` (Task 2).
- Produces: sichtbares Panel. Keine Tests (kein DOM-Testsetup); Nachweis im Browser.

- [ ] **Step 1: Komponente** — `AnalysisPanel.tsx`:

```tsx
"use client";

import { SectionLabel, Tag } from '@/components/ui';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { USE_CASES, USE_CASE_GROUP_LABELS, isAvailable, type UseCaseGroup, type UseCaseId } from '@/lib/detailCheck/analysis/catalog';
import { buildAnalysisCards, type AnalysisCard, type CardSeries } from '@/lib/detailCheck/analysis/cards';
import type { RentCalculatorResult } from '@/lib/detailCheck/analysis/metrics';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'detail-check:analysis-use-cases';
const DEFAULT_SELECTION: UseCaseId[] = ['break-even'];
const GROUPS: UseCaseGroup[] = ['auswertung', 'simulation', 'optimierung'];

function readSelection(): UseCaseId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter((id): id is UseCaseId => USE_CASES.some((item) => item.id === id)) : DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

function MiniChart({ series }: { series: CardSeries }) {
  const { values, markerIndex } = series;
  if (values.length < 2) return null;
  const width = 320;
  const height = 80;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {markerIndex != null && <circle cx={x(markerIndex)} cy={y(values[markerIndex])} r={4} fill="#c18424" />}
    </svg>
  );
}

function Card({ card }: { card: AnalysisCard }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">{card.title}</h3>
        <Tag label={card.verdict.label} variant={card.verdict.tone} />
      </div>
      {card.series && <MiniChart series={card.series} />}
      {card.rows.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {card.rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                <td className="py-1.5 text-right font-medium text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {card.note && <p className="mt-2 text-xs text-muted-foreground">{card.note}</p>}
    </article>
  );
}

export function AnalysisPanel({
  result,
  params,
  cases,
  viewPeriodYears,
  onViewPeriodYearsChange,
}: {
  result: RentCalculatorResult;
  params: CalculatorParams;
  cases: RenovationCase[];
  viewPeriodYears: number;
  onViewPeriodYearsChange: (years: number) => void;
}) {
  const [selected, setSelected] = useState<UseCaseId[]>(DEFAULT_SELECTION);
  useEffect(() => setSelected(readSelection()), []);

  const toggle = (id: UseCaseId) => {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ohne Speicher weiter */ }
      return next;
    });
  };

  const cards = useMemo(
    () => buildAnalysisCards({ selected, result, params, cases, viewPeriodYears }),
    [selected, result, params, cases, viewPeriodYears],
  );

  return (
    <section className="order-3 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionLabel>Auswertungen</SectionLabel>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Betrachtungszeitraum
          <input
            type="number"
            min={5}
            max={50}
            value={viewPeriodYears}
            onChange={(event) => onViewPeriodYearsChange(Number(event.target.value))}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-foreground"
          />
          Jahre
        </label>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-xs uppercase tracking-wide text-muted-foreground">{USE_CASE_GROUP_LABELS[group]}</span>
          {USE_CASES.filter((item) => item.group === group).map((item) => {
            const available = isAvailable(item);
            const active = available && selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                title={available ? item.question : `${item.question} (folgt)`}
                aria-pressed={active}
                disabled={!available}
                onClick={() => toggle(item.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : available
                      ? 'border-border text-foreground hover:bg-muted'
                      : 'cursor-not-allowed border-dashed border-border text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Wähle oben eine Auswertung aus.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => <Card key={card.id} card={card} />)}
        </div>
      )}
    </section>
  );
}
```

Vor dem Schreiben prüfen: Existiert `--primary` als CSS-Variable (sonst die Farbe verwenden, die `CalculatorChart` in `page.tsx` für die Hauptlinie nutzt)? Hat `Tag` die Props `label`/`variant` (ja, siehe `components/ui/Tag.tsx`)?

- [ ] **Step 2: Einbinden** — in `page.tsx` importieren und zwischen `</section>` der Section `order-2` und `<section className="order-3 space-y-4">` („Detailtabellen") einfügen; die Detailtabellen-Section bekommt `order-4`:

```tsx
{presented && effectiveParams && localResult && (
  <AnalysisPanel
    result={localResult}
    params={effectiveParams}
    cases={data.renovationCases}
    viewPeriodYears={viewPeriodYears}
    onViewPeriodYearsChange={setViewPeriodYears}
  />
)}
```

Falls `data` an dieser Stelle nullable ist, die Bedingung um `data &&` ergänzen. `localResult` ist die frische Engine-Ausgabe (`runRentCalculator`) und hat exakt den Typ `RentCalculatorResult`.

- [ ] **Step 3: Checks + Browser**

`npm run type-check && npm run lint && npm run test` grün. Im Browser (Desktop 1440 px und 375 px Breite, hell und dunkel):
- Chips in drei Gruppen, nur Break-even, Amortisation, Wirtschaftlichkeit anklickbar; Tooltip zeigt die Frage.
- Break-even-Karte: Kurve mit Marker, Werte gleich der Kennzahl „Break-even" oben auf der Seite.
- Betrachtungszeitraum 10 → Kurve kürzer, Urteile passen sich an; Seite neu laden → 10 bleibt (gespeichert).
- Plan-Balken im Gantt verschieben → Karten aktualisieren sich sofort.
- Keine Konsolenfehler, kein horizontales Scrollen.

- [ ] **Step 4: Commit**

```bash
git add src/app/property-valuation/detail-check/calculator/AnalysisPanel.tsx src/app/property-valuation/detail-check/calculator/page.tsx
git commit -m "feat(calculator): Auswertungs-Panel mit Chips und Ergebniskarten (SCRUM-96)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
