# SCRUM-96: Zielformeln und Optimierung im Mietkalkulator

**Datum:** 2026-09-23
**Status:** Entwurf zur Freigabe
**Ticket:** [SCRUM-96 „Kalkulator"](https://immoplattform360.atlassian.net/browse/SCRUM-96)
**Baut auf:** [2026-08-06-analyse-use-cases-design.md](2026-08-06-analyse-use-cases-design.md)
**Betrifft:** `apps/web/src/lib/detailCheck/`, `apps/web/src/app/property-valuation/detail-check/calculator/`

## Problem

SCRUM-96 verlangt, dass der Kunde im Kalkulator einen oder mehrere von zwölf
Use Cases anklickt (Break-even, optimale Modernisierungshöhe, Szenarioanalyse,
Empfehlung …) und je Use Case eine Grafik und eine Tabelle mit den Eckdaten
bekommt. Offen war, **wie** die dahinterliegenden Berechnungen, Optimierungen
und Zielformeln ermittelt werden und wie sie sich in das bestehende Tool
einfügen, ohne eine zweite, abweichende Rechenlogik entstehen zu lassen.

Dieses Konzept beantwortet das. Das Konzept vom 06.08. bleibt gültig, wo es
nicht ausdrücklich ersetzt wird.

## Umfang

SCRUM-96 zerfällt in drei aufeinander aufbauende Teilprojekte:

| Teilprojekt | In diesem Konzept |
| --- | --- |
| 1. Mietspiegel-Modell (Münchner Logik, weitere Städte) | **Nein** — nur als austauschbare Schnittstelle. Die Formeln stehen in einer Excel-Datei (Blatt Kalkulator, Spalten AX–AZ), die nicht vorliegt. |
| 2. Rechen- und Optimierungsschicht | **Ja** — Kern dieses Konzepts |
| 3. Integration in die Oberfläche | **Ja** |

Ausnahme zu Teilprojekt 1: Die **Mietspiegel-Entwicklung in % p. a.** gehört
in die Rechenschicht (siehe unten). Sie ist heute fest mit 2 % verdrahtet und
wird zur Kundeneingabe, wie SCRUM-96 es verlangt.

## Entscheidungen

| Entscheidung | Quelle |
| --- | --- |
| Amortisation wird **zweifach** angeboten: gegen Eigenkapital und gegen Gesamtinvestition | Kutz, SCRUM-96, 11.08. |
| Schwelle „lohnt sich" = **schwarze Null**; Verfeinerung später über Kundenfeedback | Kutz, SCRUM-96, 11.08. |
| Use Cases sind **mehrfach** auswählbar | SCRUM-96-Beschreibung |
| Mehrere Optimierungsziele: **jedes als eigener Vorschlag**, Gantt ändert sich erst bei „Übernehmen" | Nutzer, 23.09. |
| Risiko bei der Kapitalrendite wird **ausgewiesen, nicht optimiert** | Nutzer, 23.09. |
| Empfehlung **regelbasiert**; eine KI darf später nur die Begründung formulieren, nie die Zahlen | Nutzer, 23.09. |
| Mietspiegel München **ausgeklammert**, nur Schnittstelle | Nutzer, 23.09. |
| Optimierungsansatz **A**: ein allgemeiner Optimierer mit austauschbarer Zielformel | Nutzer, 23.09. |
| Eigenkapitalrendite als interner Zinsfuß inkl. Endwert = Kaufpreis × (1 + g)^Jahre | Nutzer, 23.09. |
| Urteile über einen **Betrachtungszeitraum** (Standard 15 Jahre, änderbar); Grafiken zeigen weiter 50 Jahre | Nutzer, 23.09. |

## Bestandsaufnahme

- Die Engine (`rentCalculator.ts`) ist seit dem 06.08. unverändert; es gibt
  noch keinen Analyse-Code.
- `runRentCalculator` ist eine reine Funktion (~5 ms je Lauf). Der vorhandene
  Optimierer (`optimizeKnownModernizations`, Beam-Search Breite 8) braucht
  bei 5 Maßnahmen **4.336 ms**.
- **Mietspiegel heute** (`rentIndex.ts`): feste Tabelle Baujahrklasse ×
  Flächenklasse. Sie trifft Kutz' Münchner Beispiel (1949–1978, 60–<90 m² →
  17 €/m² Mittelwert), gilt aber **bundesweit** und kennt weder Spanne,
  Ausstattung, Lage, Energieklasse noch Zuschläge.
- **Mietspiegel-Entwicklung ist fest verdrahtet**: 2 % p. a., jährlich
  sprunghaft (`Math.pow(1.02, Math.floor(offset / 12))`), an zwei Stellen
  (`plan558`, `applyRentIncreaseOverrides`). Nicht einstellbar.
- **Lücke in der Kappungsgrenze** (siehe „Ergänzungen im Rechenkern").

## Grundmodell

Alle zwölf Use Cases folgen demselben Ablauf:

```
Plan (Entscheidungsgrößen) → runRentCalculator (Simulation) → Kennzahlen → Zielformel / Urteil
```

Sie unterscheiden sich nur in drei Stellschrauben:

| Stellschraube | Ausprägungen |
| --- | --- |
| Was variiert wird | nichts · Investitionshöhe · Zeitpunkte · Auswahl der Maßnahmen |
| Woran gemessen wird | Break-even-Monat · Endcashflow · erster dauerhaft positiver Monat · EK-Rendite · ROI |
| Wie gesucht wird | ablesen · Sweep · Suchverfahren |

Daraus folgen drei Lösungsklassen: **Ablesen** (1 Lauf), **Sweep**
(10–20 Läufe), **Optimierung** (Suche). Die Empfehlung setzt auf den
Optimierungsergebnissen auf.

### Optimierungsansatz A

Ein allgemeiner Optimierer; jeder Use Case ist eine Konfiguration aus
Suchraum und Zielformel. Der Optimierer bewertet jeden Kandidaten **immer**
über `runRentCalculator` bzw. dessen interne Bewertung (`placementScore`).
Damit bleiben die §558/§559-Regeln an genau einer Stelle — dasselbe Prinzip
wie beim Client/Server-Abgleich im August.

Verworfen:
- **B – je Use Case ein eigener Optimierer:** fünf Kopien derselben
  Suchlogik, die auseinanderlaufen.
- **C – mathematischer Löser:** Die Regeln sind pfadabhängig
  (rollierendes Kappungsfenster, §558/§559 nicht im selben Monat,
  steuerlicher Verlustvortrag). Das Modell müsste ein zweites Mal als
  Gleichungssystem entstehen und würde vom Rechenkern abweichen.

Zielformeln sind **lexikografische Scores** (Tupel, kleiner = besser; bei
Gleichstand entscheidet die nächste Stelle). Die heutige Sortierung des
Optimierers ist damit exakt `[Break-even-Monat, −CF(H)]` und bleibt
bitgleich (Paritätstest).

## Ergänzungen im Rechenkern

Diese vier Änderungen sind Voraussetzung; ohne sie rechnen mehrere
Zielformeln falsch.

1. **Mietspiegel-Entwicklung `g` in % p. a.** — die heute fest verdrahteten
   2 % werden zur Eingabe, **Standard 2 %** (heutiges Verhalten, bitgleich:
   `1 + 2/100 === 1.02` gilt in JavaScript exakt). Die Stufung bleibt wie
   heute jährlich. Wirkt auf das §558-Ziel und auf den Endwert der EK-Rendite.
2. **Miete vor der letzten Erhöhung** — neue Eingabe. Das rollierende
   Drei-Jahres-Fenster der Kappungsgrenze (§558 Abs. 3) zählt heute nur
   Erhöhungen **innerhalb** der Prognose (`plan558`, `usedInWindow`). Eine
   Erhöhung kurz vor dem Kauf fehlt: Wurde die Miete 14 Monate vorher um
   20 % erhöht, erlaubt die Engine im selben Fenster nochmals volle 20 %.
   Mit `last558Date` und der Miete davor wird der Betrag in das Fenster
   eingerechnet.
3. **Zähler „dauerhaft positiv"** in `buildTimeline`: letzter Monat mit
   `cf(t) < 0` im selben Durchlauf, ohne die Timeline zu materialisieren
   (Begründung siehe Konzept vom 06.08.).
4. **Override „ausgeschlossene Maßnahmen"** in `CalculatorOverrides`, damit
   ein Auswahl-Vorschlag ohne Umweg über den Sanierungsschritt dargestellt
   werden kann. In den Sanierungsschritt geschrieben wird er erst über den
   vorhandenen Übernehmen-Dialog.

## Zielformeln

**Begriffe:** `cf(t)` Cashflow nach Steuern im Monat t; `CF(t)` kumuliert
(inkl. eingesetztem EK, falls „Eigenkapital berücksichtigen" aktiv);
`H` Horizont (50 Jahre); `B` Betrachtungszeitraum (Standard 15 Jahre) —
maßgeblich für alle Urteile.

### Klasse 1 – Ablesen

| Use Case | Formel | Eckdaten / Urteil |
| --- | --- | --- |
| Break-even | erster Monat mit `CF(t) ≥ 0` (`breakEven`); zusätzlich mit Mietspiegel (`breakEvenWithRentIndex`) | Datum, Jahre bis dahin, Tiefpunkt `min CF(t)` und Monat |
| Amortisation – Eigenkapital | erster Monat mit `Σ cf(t) ≥ EK + eigenfinanzierte Modernisierung` | Datum, Jahre |
| Amortisation – Gesamt | erster Monat mit `Σ (Miete − nicht umlagefähige Kosten − Steuern) ≥ Kaufpreis + Nebenkosten + Modernisierung` — Zins und Tilgung werden **nicht** abgezogen; die Steuern sind die im Plan berechneten (sie enthalten den Zinsabzug, weil das die tatsächliche Steuerlast ist) | Datum, Jahre |
| Wirtschaftlichkeit einer Maßnahme m | `Δ(t) = CF_mit(t) − CF_ohne(t)` | **lohnt sich ⟺ `Δ(B) ≥ 0`** (Stand am Ende des Betrachtungszeitraums — nicht „irgendwann ≥ 0“, denn vor der Zahlung sind beide Pläne identisch und `Δ = 0`); Amortisationsmonat = erster Monat **nach der Zahlung** mit `Δ(t) ≥ 0`; dazu Kosten, umlagefähiger Anteil, §559-Mehrmiete, Deckel-Ausschöpfung |

### Klasse 2 – Sweep

| Use Case | Variiert | Ergebnis |
| --- | --- | --- |
| Investitionssimulation | Gesamtbudget, 12 Stufen von Min- bis Max-Preisspanne (`distributeTotalAcrossCases`) | Kurven von `CF(B)`, Break-even und EK-Rendite über der Investitionshöhe |
| Optimale Modernisierungshöhe | derselbe Sweep | (a) wirtschaftliches Optimum `argmax CF(B)`; (b) Obergrenze = größtes Budget mit `Δ(B) ≥ 0` gegenüber „nicht modernisieren"; (c) rechtliche §559-Grenze (heutiger POTENTIAL-Modus) als Referenz |
| Szenarioanalyse | 5 feste Pläne | Vergleichstabelle, überlagerte `CF(t)`-Kurven |

**Szenarien:**

1. Nicht modernisieren — keine Maßnahme
2. Teilmodernisierung — nur Maßnahmen, die die Wirtschaftlichkeitsprüfung bestehen
3. Vollmodernisierung — alle gewählten, Standard-Zeitpunkte
4. Sofort — alle im 3. Monat
5. Etappen — verteilt auf aufeinanderfolgende §559-Sechsjahresfenster, sodass jede Etappe den Deckel neu nutzt

### Klasse 3 – Optimierung

| Use Case | Suchraum | Score |
| --- | --- | --- |
| Optimaler Zeitpunkt | Zeitpunkte | `[Break-even-Monat, −CF(H)]` (heutiges Verhalten) |
| Mieterhöhungsstrategie | Zeitpunkte der Modernisierungen; §558 folgt regelkonform | `[−Σ Miete über B, Break-even-Monat]` |
| Cashflow-Optimierung | Zeitpunkte | `[erster Monat ab dem cf(t) ≥ 0 bleibt, −CF(H)]` |
| Kapitalrendite | Zeitpunkte + Auswahl | `[−EK-Rendite p. a.]` |
| Modernisierungsstrategie | Auswahl + Zeitpunkte | `[−ROI]`, `ROI = (CF_Plan(B) − CF_ohne(B)) / Investition` |

**EK-Rendite:** interner Zinsfuß über den Betrachtungszeitraum aus
`−EK` zum Start (EK = eingesetztes Eigenkapital aus dem Finanzierungsschritt,
unabhängig vom Schalter „Eigenkapital berücksichtigen"), den monatlichen `cf(t)` und einem Endwert
`Kaufpreis × (1 + g)^Jahre − Restschuld`. Der Endwert ist eine
ausgewiesene Annahme, keine Bewertung.

**Risiko (nur ausgewiesen):** niedrigster Monats-Cashflow und Monat,
Schuldendienstdeckung = `(Miete − nicht umlagefähige Kosten) / Schuldendienst`,
Beleihungsauslauf = `Darlehen / Kaufpreis`.

### Empfehlung (regelbasiert)

Rechnet die fünf Optimierungen, wählt den Plan mit dem besten
`[Break-even-Monat, −CF(H)]` (schwarze Null zuerst) und erzeugt aus den
Zahlen eine Begründung. Eine spätere KI darf ausschließlich diesen Text
formulieren; alle Zahlen kommen aus der Engine.

## Integration

### Oberfläche

- Mehrfachauswahl als **Chips** unterhalb des Kalkulators, gruppiert nach
  Auswertungen, Simulationen und Optimierungen; beim Überfahren die Frage aus
  SCRUM-96 als Erklärung.
- Je gewähltem Use Case eine **Ergebniskarte**: Grafik, Eckdaten-Tabelle,
  Urteil als farbiges Etikett.
- **Optimierungskarten sind Vorschläge.** Die Gantt-Planung ändert sich erst
  bei „Übernehmen", über das vorhandene `commitOverrides` (erbt Speichern,
  Übernehmen-Dialog, Kontext-Fingerprint).
- Neue Eingaben: Mietspiegel-Entwicklung % p. a., Miete vor der letzten
  Erhöhung, Betrachtungszeitraum.

### Rechenarchitektur

```
lib/detailCheck/analysis/
  catalog.ts            12 Use Cases: Label, Frage, Klasse, Status
  metrics.ts            Kennzahlen aus einem Lauf (Break-even, Amortisation ×2, EK-Rendite, Risiko)
  objectives.ts         Zielformeln als lexikografische Scores
  searchSpace.ts        Zeitpunkte · Auswahl · Budget
  optimize.ts           ein Suchverfahren für alle Ziele
  scenarios.ts          5 Szenarien + Sweeps
  recommend.ts          Empfehlung + Begründungstext
  rentIndexProvider.ts  Schnittstelle Mietspiegel (heute grobe Tabelle, später München)
```

Alles reine Funktionen über `runRentCalculator` — ohne Datenbank, voll
testbar, im Browser und auf dem Server identisch.

### Laufzeit

- **Web Worker**, bis zu 4 parallel, Fortschritt je Karte.
- **Auswahl-Suche zweistufig:** alle Kombinationen mit Standard-Zeitpunkten
  grob bewerten (2ⁿ × ~5 ms; 8 Maßnahmen ≈ 1,3 s), dann nur die drei besten
  zeitlich feinoptimieren. Ohne Vorstufe wären es 2ⁿ × ~4,3 s.
- **Ergebnis-Cache** über einen Fingerprint der Eingaben; erneutes Anklicken
  rechnet nicht neu.

## Umsetzungsreihenfolge

Jeder Schnitt bekommt einen eigenen Implementierungsplan.

| Schnitt | Inhalt | Ergebnis |
| --- | --- | --- |
| 0 – Fundament | Ergänzungen 1–4 im Rechenkern; Zielformel-Register mit bitgleichem Paritätstest | Engine rechnet korrekt |
| 1 – Auswertungen | Panel, Chips, Karten; Break-even, Amortisation ×2, Wirtschaftlichkeit; Betrachtungszeitraum | erste sichtbare Antworten |
| 2 – Simulationen | Investitionssimulation, optimale Höhe, Szenarien | Vergleiche |
| 3 – Optimierung I | Worker, Suchverfahren; Zeitpunkt, Mieterhöhungsstrategie, Cashflow | Vorschläge + Übernehmen |
| 4 – Optimierung II | Auswahl-Suche; Modernisierungsstrategie, Kapitalrendite; Empfehlung | vollständig |

Der Mietspiegel München folgt als eigenes Teilprojekt über
`rentIndexProvider`, sobald die Excel-Datei vorliegt.

## Tests

- **Parität:** alter Optimierer und neues Register liefern bitgleiche Ergebnisse.
- **Kennzahlen** gegen die echte Fixture (`__fixtures__/calculatorResponse.sample.json`).
- **Rechtsregel:** Kappungsgrenze mit einer Erhöhung vor dem Kauf; Mietspiegel-Entwicklung 2 % ergibt exakt das heutige Ergebnis (Golden-Snapshot `realWorkflowSnapshot`).
- **Zielformeln:** je ein konstruierter Fall mit bekanntem Optimum.
- **Zähler „dauerhaft positiv"** gegen eine vollständig materialisierte Timeline.

## Nicht enthalten

| Punkt | Grund |
| --- | --- |
| Mietspiegel München und weitere Städte | Formeln liegen nur in der nicht vorhandenen Excel; eigenes Teilprojekt |
| Echte Risikoszenarien (Leerstand, Zinsanstieg, Mietausfall) | Entscheidung: Risiko nur ausweisen |
| KI-formulierte Begründung | später; Schnittstelle ist vorgesehen |
| EK-Quote als Optimierungsgröße | Eigenkapital kommt aus dem Finanzierungsschritt |

## Risiken

1. **Laufzeit:** Vorschläge für alle fünf Ziele plus Empfehlung liegen trotz
   Parallelisierung im Bereich mehrerer Sekunden. Die Karten zeigen deshalb
   Fortschritt; der Cache verhindert Wiederholungen.
2. **Endwert-Annahme:** Die EK-Rendite hängt stark von `g` ab. Der Wert wird
   in der Karte sichtbar genannt.
3. **Anlageberatung:** Karten zeigen Kennzahlen und Annahmen; die Empfehlung
   begründet, statt zu raten.
