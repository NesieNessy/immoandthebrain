/** Slices `items` to the given 1-indexed `page` — shared by all three
 *  Netzwerk tabs, which all show a "Zurück"/"Weiter" + "N Ergebnisse"
 *  footer over a plain in-memory list (none of them are backed by
 *  Table.tsx, whose own pagination uses a chevron + "Seite X von Y"
 *  control instead — this app has no other "Zurück"/"Weiter" precedent). */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

export function totalPages(itemCount: number, pageSize: number): number {
    return Math.max(1, Math.ceil(itemCount / pageSize));
}

/** Clamps a page number into [1, totalPages] — used whenever the underlying
 *  list shrinks (e.g. a filter narrows results) so the current page never
 *  points past the end. */
export function clampPage(page: number, itemCount: number, pageSize: number): number {
    return Math.min(Math.max(1, page), totalPages(itemCount, pageSize));
}
