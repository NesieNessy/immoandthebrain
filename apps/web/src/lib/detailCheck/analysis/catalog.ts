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
