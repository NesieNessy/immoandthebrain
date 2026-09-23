# Analyse-Use-Cases im Mietkalkulator

**Datum:** 2026-08-06
**Status:** Entwurf zur Freigabe
**Betrifft:** `apps/web/src/app/property-valuation/detail-check/calculator/`, `apps/web/src/lib/detailCheck/`

## Problem

Der Mietkalkulator rechnet vollständig, aber er beantwortet keine Frage. Er zeigt Zahlen;
der Kunde muss selbst herausfinden, was sie für seine Entscheidung bedeuten. Gefragt sind
konkrete Antworten auf konkrete Fragen: Wann trägt sich das Objekt? Wie viel darf ich
maximal in Modernisierung stecken? Wann modernisiere ich am besten?

Der Kunde soll unterhalb des Kalkulators seine Frage aus einer Liste wählen, eine kurze
Erklärung dazu sehen, eine Aktion auslösen und darunter die Antwort bekommen.

## Bestandsaufnahme

`runRentCalculator` (`lib/detailCheck/rentCalculator.ts`) ist eine **reine Funktion** ohne
I/O und läuft seit dem Frontend-Umbau auch im Browser. Das ist der entscheidende Hebel:
Jede „Was-wäre-wenn"-Analyse ist nur eine Schleife über diese Funktion.

**Gemessen** (echte Fixture, 5 Sanierungsfälle, 120 m²):

| Pfad | Dauer |
| --- | --- |
| `placementMode: 'DEFAULT'` (Live-Vorschau) | 5 ms |
| `placementMode: 'OPTIMIZED'` (Optimieren-Button) | **4.336 ms** |

Die 4,3 s entstehen bei ausschließlicher Variation der *Zeitpunkte*. Jede zusätzliche
Suchdimension (Teilmenge der Maßnahmen, Investitionshöhe, EK-Quote) multipliziert das.

**Abdeckung der zwölf gewünschten Use Cases durch den Bestand:**

| Use Case | Bestand |
| --- | --- |
| Break-even-Analyse | Fertig — `breakEven`, `breakEvenWithRentIndex` |
| Wirtschaftlichkeitsprüfung Modernisierung | Fertig gerechnet — `capAbs`, `remaining559Room`, `previous559Used`, `monthlyDelta` je Maßnahme |
| Amortisationsanalyse | Ableitung aus `timeline[].cumulativeCashflow` |
| Optimaler Modernisierungszeitpunkt | Vorhanden — Beam-Search (Breite 8) + lokale Nachoptimierung ±9 Monate |
| Mieterhöhungsstrategie | Weitgehend — `plan558` plant §558 regelkonform inkl. Sperrfristen und Kappungsgrenze |
| Optimale Modernisierungshöhe | Vorhanden als unbenannter `mode: 'POTENTIAL'` (siehe unten) |
| Investitionssimulation, Szenarioanalyse, Cashflow-Optimierung | Parametersweep über die vorhandene Engine, keine neue Domänenlogik |
| Modernisierungsstrategie (welche Kombination) | Fehlt — der Optimierer variiert nur Zeitpunkte, nicht die Auswahl |
| Investitionsempfehlung durch KI | Keine Basis — im gesamten Projekt existiert keine LLM-Anbindung |

### Der bestehende `POTENTIAL`-Modus

Das Szenario-Dropdown („Bekannte Werte" / „Potentielle Werte") und der danebenliegende
Schieberegler schalten `CalculatorParams.mode`. `POTENTIAL` verwirft die echten
Sanierungsfälle und setzt zwei synthetische Modernisierungen, die den §559-Deckel maximal
ausschöpfen (gemessen, 120 m²):

```
2026-11  Potenzial 1  +360,00 €/Mon  implizierte Kosten 54.000 €
2032-11  Potenzial 2  +360,00 €/Mon  implizierte Kosten 54.000 €
```

360 € ist exakt `capAbs` (3 €/m² × 120 m²); 54.000 € ist `360 × 12 / 0,08`, also die
Investition, die eine solche Umlage bei 8 % gerade trägt. Der zweite Termin liegt auf
Monat 75 — genau wenn das §559-Sechsjahresfenster zurücksetzt.

**Das ist inhaltlich bereits der Use Case „Optimale Modernisierungshöhe"**, nur unbenannt
und unerklärt. Mit vier Mängeln:

1. **Bug:** Verschieben im Gantt ist in `POTENTIAL` wirkungslos. Nachgewiesen: mit
   `modernizationPlacements: { 'potential-1': '2030-01' }` bleibt der Plan auf `2026-11` —
   `placePotentialModernizations` liest die Placements nicht.
2. Der Schieberegler dupliziert das Dropdown; seine Beschriftung „Bekannte Werte ⇄
   Potentielle Werte" suggeriert ein Mischen, tatsächlich ist es ein harter Umschalter.
3. Nirgends erklärt — der Kunde sieht „Potenzial 1" und 54.000 € ohne Kontext.
4. Zeitpunkte hartcodiert (Monat 3 und 75); „Optimieren" ist in `POTENTIAL` deaktiviert.

## Entscheidungen

| Entscheidung | Begründung |
| --- | --- |
| Die Auswahl steuert die **Zielfunktion**, nicht nur die Darstellung | Der Kunde soll „Optimieren" drücken und der Kalkulator optimiert auf sein Ziel hin. |
| Alle zwölf Punkte bleiben im Dropdown, die **Aktion passt sich an** | Die Punkte haben drei Antwortformen (Optimierung / Vergleich / Auskunft). Ein starrer „Optimieren"-Button passt auf sechs von zwölf nicht. |
| Panel **unterhalb des Kalkulators**, nicht auf der Ergebnisseite | Der Kunde will das Ergebnis unmittelbar an der Planung sehen, die er gerade bearbeitet. |
| `POTENTIAL` geht im Use-Case-Dropdown auf | Beseitigt zwei konkurrierende Bedienkonzepte und die Mängel 1–4 in einem Zug. |
| Optimierung im **Web Worker** | 4,3 s auf dem Main Thread frieren den Tab ein; serverseitig kostet es Serverless-CPU pro Klick und läuft ins Timeout-Risiko. |

## Umfang Schnitt 1

**Nutzbar:**

- Break-even-Analyse *(Auskunft)*
- Amortisationsanalyse *(Auskunft)*
- Wirtschaftlichkeitsprüfung Modernisierung *(Auskunft, zunächst ohne Verdikt — siehe offene Punkte)*
- Cashflow-Optimierung *(Optimierung — erstes austauschbares Ziel)*
- Optimale Modernisierungshöhe *(der bisherige `POTENTIAL`-Modus, benannt und erklärt)*

**Sichtbar, aber als „in Vorbereitung" markiert:** die übrigen sieben. Sie zeigen ihre
Erklärung, liefern aber kein Ergebnis — nie ein Scheinergebnis.

**Entfernt:** Szenario-Dropdown und Schieberegler. `mode: 'POTENTIAL'` bleibt intern
erhalten und wird von der Use-Case-Auswahl gesetzt. **Keine Datenmigration nötig.**

## Architektur

### 1. Katalog — `lib/detailCheck/analysisUseCases.ts`

Rein deklarativ, keine Logik:

```ts
export type AnalysisKind = 'INSIGHT' | 'OPTIMIZATION' | 'COMPARISON';

export type AnalysisUseCase = {
  id: AnalysisUseCaseId;
  label: string;      // Dropdown-Text
  question: string;   // die Erklärung daneben
  kind: AnalysisKind; // steuert Buttontext und Darstellung
  status: 'READY' | 'PLANNED';
};
```

`kind` bestimmt die Beschriftung der Aktion: `OPTIMIZATION` → „Optimieren",
`COMPARISON` → „Szenarien vergleichen", `INSIGHT` → „Auswerten".

### 2. Auskünfte — `lib/detailCheck/analysis/insights.ts`

Reine Funktionen über dem **vorhandenen** `runRentCalculator`-Ergebnis:

```ts
type InsightResult = {
  headline: string;
  value: string;
  explanation: string;
  supporting: { label: string; value: string }[];
};

analyzeBreakEven(result): InsightResult
analyzeAmortization(result): InsightResult
analyzeModernizationViability(result): InsightResult
```

Keine Engine-Änderung, Laufzeit vernachlässigbar, vollständig unit-testbar.

### 3. Austauschbare Zielfunktion

Heute ist das Ziel in `optimizeKnownModernizations` fest verdrahtet (sortiert nach
`breakEvenOffset`, dann `endingCashflow`). Künftig liefert eine Zielgröße einen
**lexikografischen Tupel-Score**, kleiner ist besser:

```ts
/** Was `placementScore` je Kandidat liefert: buildTimeline-Ergebnis + breakEvenOffset. */
type ScoredPlan = ReturnType<typeof placementScore>;

export type OptimizationObjective = {
  id: AnalysisUseCaseId;
  /** Lexikografisch verglichen; kleiner = besser. */
  score: (scored: ScoredPlan) => number[];
};
```

| Ziel | Score |
| --- | --- |
| `EARLIEST_BREAK_EVEN` (heutiges Verhalten) | `[breakEvenOffset, -endingCashflow]` |
| `FASTEST_POSITIVE_CASHFLOW` (neu) | `[sustainablyPositiveOffset, -endingCashflow]` |

Das Tupel bildet die heutige Sortierung samt Tie-Break exakt ab. Der bestehende
„Optimieren"-Button behält damit **bitgleiches** Verhalten; ein Paritätstest sichert das ab.

Die Zielgröße setzt bewusst auf `placementScore` auf, **nicht** auf `CalculatorResult`:
Der Optimierer baut je Kandidat kein vollständiges Ergebnis.

#### Notwendige Ergänzung in `buildTimeline`

`placementScore` ruft `buildTimeline(..., includeTimeline = false)` — die Timeline-Zeilen
werden während der Optimierung absichtlich **nicht** materialisiert. Bei rund 1.900
Kandidaten × 600 Monaten spart das über eine Million Objektallokationen; das Flag ist der
Grund, warum die Optimierung überhaupt bei 4,3 s liegt.

Damit steht `timeline` für das neue Ziel nicht zur Verfügung. Es wäre falsch, das Flag
einzuschalten — das würde die Laufzeit deutlich verschlechtern. Stattdessen berechnet
`buildTimeline` den Wert **im selben Durchlauf mit konstantem Speicher**, genau wie
`breakEven` es heute schon tut:

```ts
// im Monats-Loop, unabhängig von includeTimeline:
if (afterTaxCashflow < 0) lastNegativeCashflowOffset = offset;
// am Ende:
sustainablyPositiveOffset = lastNegativeCashflowOffset + 1;
```

`buildTimeline` gibt zusätzlich `sustainablyPositiveOffset` zurück. Kein neuer Durchlauf,
keine Allokation, und für die Auskunfts-Use-Cases ohnehin nützlich.

Maßgeblich ist der Cashflow **nach Steuern** (`afterTaxCashflow`) — konsistent mit der
Amortisationsdefinition und der bestehenden Kachel „Break-even nach Steuern".

### 4. Web Worker

`runRentCalculator` ist rein und damit ohne Anpassung worker-tauglich. Der Worker
importiert dieselbe Bibliothek — keine Zweitimplementierung. Er meldet Fortschritt und ist
abbrechbar.

Der bestehende serverseitige `optimize`-Pfad bleibt in Schnitt 1 unangetastet; beide Wege
nutzen dieselbe Zielgrößen-Registry. Die Migration des alten Buttons auf den Worker ist ein
späterer Schnitt.

### 5. Komponente — `calculator/AnalysisPanel.tsx`

Eigene Datei; die Kalkulator-Seite hat bereits rund 2.450 Zeilen. Das Panel bekommt
`effectiveParams`, `renovationCases` und `localResult` als Props — die Seite berechnet sie
ohnehin — und hält Worker und eigenen Zustand.

## Datenfluss

1. Die Seite berechnet `effectiveParams` und `localResult` (bereits vorhanden).
2. `AnalysisPanel` erhält beides als Props.
3. **INSIGHT:** reine Funktion auf `localResult`, sofortiges Ergebnis, kein Worker.
4. **OPTIMIZATION:** `{ params, cases, objectiveId }` an den Worker → Fortschritt →
   bester Plan.
5. Das Ergebnis fließt über das bestehende `commitOverrides` in die Gantt-Planung zurück —
   **kein Parallelzustand**. Damit erbt es Debounce, Übernehmen-Dialog und
   Kontext-Fingerprint unverändert.

**Persistenz der Auswahl:** wird aus `mode` abgeleitet, wo sie die Rechnung beeinflusst
(`POTENTIAL` → „Optimale Modernisierungshöhe"); sonst flüchtig. Kein neues Feld, kein
inkonsistenter Zustand nach Reload.

## Fachliche Definitionen

**Amortisation** — erster Monat, in dem der kumulierte Cashflow **nach Steuern** das
eingesetzte **Eigenkapital** übersteigt. Nach Steuern, weil `cumulativeCashflow` bereits so
vorliegt und die bestehende Kachel „Break-even nach Steuern" heißt; alles andere wäre
innerhalb einer Seite widersprüchlich.

**Dauerhaft positiver Cashflow** — erster Monat, ab dem der monatliche Cashflow **nach
Steuern** bis zum Ende des Horizonts **nie wieder negativ** wird. Nicht der erste positive
Monat: einzelne Modernisierungszahlungen reißen sonst Monate ins Minus und würden das
Ergebnis verfälschen. „Nach Steuern" ist aus der Amortisationsentscheidung abgeleitet, damit
die Seite nicht zwei Cashflow-Begriffe nebeneinander führt — bei Bedarf korrigierbar.

**Wirtschaftlichkeitsprüfung** — die Schwelle für ein „lohnt sich"-Verdikt ist **offen**.
Schnitt 1 liefert deshalb die Fakten ohne Urteil: Kosten, davon umlagefähig, §559-Deckel,
Ausschöpfung, tatsächliche Mehrmiete, Amortisationsdauer der Modernisierung selbst.

## Tests

- **Katalog:** Vollständigkeit — jeder Eintrag hat Label, Frage, `kind`, `status`.
- **Auskünfte:** Unit-Tests je Funktion gegen die vorhandene Fixture, inklusive
  Randfälle (kein Break-even innerhalb des Horizonts, Cashflow nie dauerhaft positiv).
- **Zielfunktion:** Tests des lexikografischen Vergleichs.
- **`sustainablyPositiveOffset` (kritisch):** Der im Ein-Durchlauf berechnete Wert muss dem
  entsprechen, was sich aus einer vollständig materialisierten `timeline` ergibt. Der Test
  vergleicht beide Pfade (`includeTimeline` an und aus) gegeneinander — sonst driftet die
  schnelle Variante unbemerkt von der sichtbaren ab.
- **Paritätstest (kritisch):** `OPTIMIZED` mit `EARLIEST_BREAK_EVEN` erzeugt exakt dieselbe
  Ausgabe wie heute. Sichert den Umbau des Optimierers ab.
- **Regression `POTENTIAL`:** Die Umbenennung zum Use Case ändert das Rechenergebnis nicht.

## Nicht in Schnitt 1

| Punkt | Grund |
| --- | --- |
| Modernisierungsstrategie (welche Kombination) | Teilmengenauswahl (2ⁿ) × Zeitpunkte; mit dem heutigen Optimierer nicht in vertretbarer Zeit lösbar |
| Kapitalrendite optimieren | EK-Rendite wird nicht berechnet, EK-Quote ist kein Optimierungsparameter, und „bei vertretbarem Risiko" verlangt eine Risikomodellierung, die es nicht gibt |
| Investitionsempfehlung durch KI | Keinerlei LLM-Anbindung im Projekt; eigenes Vorhaben inklusive Kosten-, Prompt- und Haftungsfragen |
| Optimierte statt hartcodierte Potenzial-Zeitpunkte | Erst nach dem Umbau der Zielfunktion sinnvoll |
| Migration des alten `optimize`-Pfads auf den Worker | Hält den ersten Schnitt klein |

## Risiken und offene Punkte

1. **Laufzeit wächst überproportional.** Schon heute 4,3 s bei fünf Fällen. Jede weitere
   Suchdimension multipliziert. Der Worker löst das Einfrieren, nicht die Dauer — sobald
   Ziele mit größerem Suchraum dazukommen, braucht es ein billigeres Scoring oder ein
   grob-zu-fein-Verfahren.
2. **Risiko ist nicht modelliert.** Leerstand, Mietausfall und Instandhaltungsrücklage
   kommen im Modell nicht vor. Aussagen zur Risikoabwägung sind derzeit nicht gedeckt.
3. **Verdikt-Schwelle offen** (siehe fachliche Definitionen).
4. **Anlageberatung.** Formulierungen sollten Kennzahlen und Annahmen zeigen, statt eine
   Empfehlung auszusprechen — insbesondere sobald der KI-Use-Case dazukommt.
