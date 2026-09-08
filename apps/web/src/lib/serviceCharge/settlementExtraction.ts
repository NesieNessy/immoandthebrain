/** Shape returned by the /api/settlement-extract route after reading an
 *  uploaded Nebenkostenabrechnung document — dates as YYYY-MM-DD, or null
 *  when the document didn't state them clearly. */
export interface ExtractedCostItem {
    label: string;
    /** true = umlagefähig (recharged to tenants), false = nicht umlagefähig. */
    allocable: boolean;
    actualAmount: number | null;
    budgetAmount: number | null;
}

export interface ExtractedSettlementData {
    periodStart: string | null;
    periodEnd: string | null;
    costItems: ExtractedCostItem[];
}

/** Normalizes a cost-position label for matching extracted rows against the
 *  standard BetrKV list already in the table (documents phrase the same
 *  position differently — "Wasser" vs. "Wasserversorgung", punctuation,
 *  casing) — collapses whitespace/punctuation so near-identical labels match. */
export function normalizeLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Merges extracted cost items into the current form rows: an extracted item
 * whose (normalized) label matches an existing row updates that row in place
 * (preserving its id, so saving updates rather than duplicates); anything
 * unmatched is appended as a new row via `makeNew`.
 */
export function mergeExtractedCostItems<T extends { label: string; allocable: boolean; actualAmount: string; budgetAmount: string }>(
    current: T[],
    extracted: ExtractedCostItem[],
    makeNew: (item: ExtractedCostItem) => T,
): T[] {
    const result = [...current];
    for (const item of extracted) {
        const key = normalizeLabel(item.label);
        const index = result.findIndex((row) => normalizeLabel(row.label) === key);
        if (index >= 0) {
            result[index] = {
                ...result[index],
                allocable: item.allocable,
                actualAmount: item.actualAmount != null ? String(item.actualAmount) : result[index].actualAmount,
                budgetAmount: item.budgetAmount != null ? String(item.budgetAmount) : result[index].budgetAmount,
            };
        } else {
            result.push(makeNew(item));
        }
    }
    return result;
}
