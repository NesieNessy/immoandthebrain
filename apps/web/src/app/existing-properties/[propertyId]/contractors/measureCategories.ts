// Static category list + rough cost-per-category reference used by the
// per-measure detail page's "Preisindikation" card. There is no real
// pricing/AI engine behind this — it's a fixed rule-of-thumb lookup (same
// idea as DEFAULT_COST_ITEMS for Nebenkosten), clearly framed in the UI as
// "je nach Region & Qualität" rather than a precise quote.

export const MEASURE_CATEGORIES = [
    { value: 'Badezimmer', label: 'Badezimmer' },
    { value: 'Fenster', label: 'Fenster' },
    { value: 'Fußboden', label: 'Fußboden' },
    { value: 'Elektrik', label: 'Elektrik' },
    { value: 'Dach', label: 'Dach' },
    { value: 'Heizung', label: 'Heizung' },
    { value: 'Fassade', label: 'Fassade' },
    { value: 'Küche', label: 'Küche' },
    { value: 'Sonstige', label: 'Sonstige' },
];

export interface CostEstimateItem {
    label: string;
    min: number;
    max: number;
}

export const MEASURE_CATEGORY_ESTIMATES: Record<string, CostEstimateItem[]> = {
    Badezimmer: [
        { label: 'Rückbau / Entsorgung', min: 500, max: 1000 },
        { label: 'Neue Fliesen inkl. Verlegung', min: 2000, max: 4000 },
        { label: 'Neue Sanitäranlagen (WC, Dusche/Wanne)', min: 2000, max: 5000 },
        { label: 'Barrierefreie Ausstattung (Griffe, Sitz)', min: 1500, max: 3000 },
        { label: 'Elektrik und Wasseranschlüsse', min: 500, max: 1500 },
        { label: 'Arbeitskosten (Installateure, Fliesenleger)', min: 2000, max: 4000 },
    ],
    Fenster: [
        { label: 'Fenster ausbauen & entsorgen', min: 300, max: 600 },
        { label: 'Neue Fenster (Material, ca. 5 Stück)', min: 3500, max: 7000 },
        { label: 'Montage & Abdichtung', min: 800, max: 1500 },
        { label: 'Fensterbänke innen/außen', min: 400, max: 900 },
    ],
    Fußboden: [
        { label: 'Alten Bodenbelag entfernen', min: 400, max: 800 },
        { label: 'Untergrund vorbereiten/ausgleichen', min: 500, max: 1200 },
        { label: 'Neuer Bodenbelag (Material)', min: 2500, max: 5500 },
        { label: 'Verlegung', min: 1500, max: 3000 },
        { label: 'Sockelleisten', min: 300, max: 600 },
    ],
    Elektrik: [
        { label: 'Bestandsaufnahme & Planung', min: 300, max: 600 },
        { label: 'Neue Leitungen verlegen', min: 2000, max: 4500 },
        { label: 'Sicherungskasten erneuern', min: 800, max: 1800 },
        { label: 'Steckdosen & Schalter', min: 600, max: 1500 },
        { label: 'Elektroprüfung & Abnahme', min: 300, max: 600 },
    ],
    Dach: [
        { label: 'Gerüst & Baustelleneinrichtung', min: 1500, max: 3000 },
        { label: 'Eindeckung erneuern', min: 8000, max: 18000 },
        { label: 'Dämmung', min: 3000, max: 7000 },
        { label: 'Dachrinnen & Spenglerarbeiten', min: 1500, max: 3500 },
    ],
};

export function estimateRange(category: string | null): { min: number; max: number } | null {
    const items = category ? MEASURE_CATEGORY_ESTIMATES[category] : undefined;
    if (!items) return null;
    return {
        min: items.reduce((sum, i) => sum + i.min, 0),
        max: items.reduce((sum, i) => sum + i.max, 0),
    };
}
