"use client";

import { useToast } from '@/components/ui';
import { getProperties, getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import {
    createTaxExpenseCategory,
    deleteTaxExpenseCategory,
    getTaxExpenseCategoriesByProperty,
    updateTaxExpenseCategory,
} from '@/lib/supabase/tax_expense_category.supabase';
import {
    deleteTaxExpenseDocument,
    deleteTaxExpenseDocumentsForYear,
    getTaxExpenseDocumentsByCategory,
    getTaxExpenseDocumentUrl,
    uploadTaxExpenseDocument,
} from '@/lib/supabase/tax_expense_document.supabase';
import { ensureDefaultTaxExpenseCategories } from '@/lib/taxExpense/defaultCategories';
import { availableTaxYears, summarizeTaxYear } from '@/lib/taxExpense/taxYearSummary';
import type { Property, PropertyUnit, TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface CategoryRow {
    category: TaxExpenseCategory;
    documents: TaxExpenseDocument[];
    isUploading: boolean;
}

export function useTaxDocumentsData(propertyId: string) {
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const contextUnitId = searchParams.get('unit');
    const [property, setProperty] = useState<Property | null>(null);
    const [rows, setRows] = useState<CategoryRow[]>([]);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<TaxExpenseCategory | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    // Years with a real receipt (or the current calendar year) show up on
    // their own — this adds a year on top of that, for planning ahead before
    // any receipt for it exists yet. Local/session-only: once the user
    // actually adds a category or receipt in it, it becomes a "real" year
    // (derived from that data) and no longer depends on this.
    const [manuallyAddedYears, setManuallyAddedYears] = useState<number[]>([]);
    // The current calendar year always gets a card by default (a landlord
    // always needs somewhere to start this year's filing) — this tracks
    // whether the user explicitly deleted it, since without an explicit
    // flag it would either always win (current year could never actually be
    // deleted) or only show up when the list is otherwise completely empty
    // (which made it vanish the instant any *other* year was added, even
    // though the user never asked to remove it).
    const [currentYearDismissed, setCurrentYearDismissed] = useState(false);
    // Archiving just hides a year from the cards row (session-only, nothing
    // persisted or deleted) — "Archivierte Jahre anzeigen" brings it back.
    const [archivedYears, setArchivedYears] = useState<Set<number>>(new Set());
    const [showArchivedYears, setShowArchivedYears] = useState(false);
    const [pendingDeleteYear, setPendingDeleteYear] = useState<number | null>(null);
    const [isDeletingYear, setIsDeletingYear] = useState(false);
    // The last label persistLabel actually confirmed to the server for each
    // category — deliberately NOT read from `rows`, because updateLocalLabel
    // (fired on every keystroke) already overwrites rows[i].category.label
    // with whatever the user is currently typing. persistLabel needs to know
    // what the label was *before* this edit to tell "naming a blank
    // category" apart from "renaming an already-named one" (and from each
    // other's other-property sync target) — reading from `rows` at blur time
    // would just compare the new value against itself.
    const persistedLabelsRef = useRef<Map<number, string>>(new Map());

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;
        (async () => {
            const foundUnits = await getPropertyUnitsByProperty(id);
            if (!cancelled) setUnits(foundUnits);
            const [foundProperty, foundCategories] = await Promise.all([
                getPropertyById(id),
                getTaxExpenseCategoriesByProperty(id),
            ]);
            if (cancelled) return;
            setProperty(foundProperty);

            let categories = foundCategories;
            if (foundProperty) {
                // A brand-new property (no categories at all yet) first picks
                // up whatever custom categories the user's other properties
                // already have, so it starts fully in sync with them.
                if (foundCategories.length === 0) {
                    const otherProperties = (await getProperties(foundProperty.userId)).filter((p) => p.propertyId !== id && !p.archivedAt);
                    const otherCategorySets = await Promise.all(otherProperties.map((p) => getTaxExpenseCategoriesByProperty(p.propertyId)));
                    const seenLabels = new Set<string>();
                    const labelsToSeed: string[] = [];
                    for (const set of otherCategorySets) {
                        for (const c of set) {
                            const key = c.label.trim().toLowerCase();
                            if (key && !seenLabels.has(key)) {
                                seenLabels.add(key);
                                labelsToSeed.push(c.label);
                            }
                        }
                    }
                    if (labelsToSeed.length > 0) {
                        const created = await Promise.all(labelsToSeed.map((label, index) =>
                            createTaxExpenseCategory({ propertyId: id, sortOrder: index, label, amount: 0, elsterReference: null }),
                        ));
                        categories = created.filter((c): c is TaxExpenseCategory => c !== null);
                    }
                }
                // The reference defaults are always ensured on top, topping
                // up whichever ones are still missing — not just on a
                // brand-new property, but also one that already has some
                // categories (e.g. only picked up a smaller custom set above).
                categories = await ensureDefaultTaxExpenseCategories(id, categories);
            }
            if (cancelled) return;

            const documentsByCategory = await Promise.all(categories.map((c) => getTaxExpenseDocumentsByCategory(c.taxExpenseCategoryId)));
            if (cancelled) return;
            setRows(categories.map((category, index) => ({ category, documents: documentsByCategory[index], isUploading: false })));
            persistedLabelsRef.current = new Map(categories.map((c) => [c.taxExpenseCategoryId, c.label]));
            setSelectedYear((current) => current ?? availableTaxYears(documentsByCategory.flat())[0] ?? new Date().getFullYear());
            setIsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [propertyId]);

    const hasEmptyCategoryLabel = rows.some((row) => !row.category.label.trim());

    const allDocuments = useMemo(() => rows.flatMap((row) => row.documents), [rows]);
    const availableYears = useMemo(() => {
        const years = new Set([...availableTaxYears(allDocuments), ...manuallyAddedYears]);
        // The current year shows by default (whether or not it has any real
        // receipts yet) unless the user explicitly deleted its card — real
        // documents in it always win regardless, since those already put it
        // in `years` above via availableTaxYears. Deliberately no "never
        // truly empty" fallback here: forcing the current year back in
        // whenever it was the only year left would make it undeletable in
        // exactly the case a landlord is most likely to want to delete it
        // (nothing else uploaded yet) — an empty "Dieses Objekt · nach Jahr"
        // row is fine; "Jahr hinzufügen" is still right there.
        if (!currentYearDismissed) years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [allDocuments, manuallyAddedYears, currentYearDismissed]);
    // One breakdown per available year — backs the "Dieses Objekt · nach
    // Jahr" cards, letting the user pick which year the table below shows.
    const yearSummaries = useMemo(
        () => availableYears.map((year) => summarizeTaxYear(rows.map((row) => row.category), allDocuments, year)),
        [availableYears, rows, allDocuments],
    );
    const currentYearBreakdown = useMemo(
        () => selectedYear != null ? summarizeTaxYear(rows.map((row) => row.category), allDocuments, selectedYear) : null,
        [rows, allDocuments, selectedYear],
    );
    const isCategoryUploading = (categoryId: number): boolean =>
        rows.find((row) => row.category.taxExpenseCategoryId === categoryId)?.isUploading ?? false;

    // "Dieses Objekt · nach Jahr" already shows every year with a real
    // receipt — this adds a card for any year the user picks on top of that
    // (planning ahead before the calendar rolls over, or filling in a past
    // year that never got a receipt uploaded). A no-op if that year already
    // has a card (real or previously added).
    const addYear = (year: number) => {
        if (year === new Date().getFullYear()) setCurrentYearDismissed(false);
        if (availableYears.includes(year)) { setSelectedYear(year); return; }
        setManuallyAddedYears((prev) => [...prev, year]);
        setSelectedYear(year);
    };

    const visibleYearSummaries = useMemo(
        () => showArchivedYears ? yearSummaries : yearSummaries.filter((summary) => !archivedYears.has(summary.year)),
        [yearSummaries, archivedYears, showArchivedYears],
    );

    const jumpAwayFromYear = (year: number) => {
        const nextVisible = yearSummaries.find((summary) => summary.year !== year && !archivedYears.has(summary.year));
        setSelectedYear(nextVisible?.year ?? new Date().getFullYear());
    };

    // Archiving only hides a year from the cards row — nothing is deleted or
    // persisted, so it's back as soon as "Archivierte Jahre anzeigen" is on.
    const archiveYear = (year: number) => {
        setArchivedYears((prev) => new Set(prev).add(year));
        if (selectedYear === year) jumpAwayFromYear(year);
    };
    const unarchiveYear = (year: number) => {
        setArchivedYears((prev) => {
            const next = new Set(prev);
            next.delete(year);
            return next;
        });
    };

    const requestDeleteYear = (year: number) => setPendingDeleteYear(year);
    const cancelDeleteYear = () => setPendingDeleteYear(null);

    // Unlike categories, receipts are never cross-property synced — deleting
    // a year's receipts only ever touches this property.
    const confirmDeleteYear = async () => {
        if (pendingDeleteYear == null || !property) return;
        const year = pendingDeleteYear;
        setIsDeletingYear(true);
        try {
            const result = await deleteTaxExpenseDocumentsForYear(property.propertyId, year);
            if (!result) {
                showToast('Jahr konnte nicht gelöscht werden.', 'error');
                return;
            }
            setRows((prev) => prev.map((row) => {
                const updatedCategory = result.categories.find((c) => c.taxExpenseCategoryId === row.category.taxExpenseCategoryId);
                return {
                    ...row,
                    category: updatedCategory ?? row.category,
                    documents: row.documents.filter((d) => new Date(d.createdAt).getFullYear() !== year),
                };
            }));
            setManuallyAddedYears((prev) => prev.filter((y) => y !== year));
            setArchivedYears((prev) => {
                const next = new Set(prev);
                next.delete(year);
                return next;
            });
            if (year === new Date().getFullYear()) setCurrentYearDismissed(true);
            setPendingDeleteYear(null);
            if (selectedYear === year) jumpAwayFromYear(year);
            showToast(
                result.deletedCount > 0
                    ? `${result.deletedCount} Beleg${result.deletedCount === 1 ? '' : 'e'} aus ${year} gelöscht.`
                    : `Jahr ${year} entfernt.`,
                'success',
            );
        } finally {
            setIsDeletingYear(false);
        }
    };

    const updateLocalLabel = (categoryId: number, label: string) => {
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, category: { ...row.category, label } } : row));
    };

    // Categories are kept in sync by name across every active property —
    // adding, renaming, and deleting one here does the same on every other
    // property that has (or, for adding, doesn't yet have) a category with
    // that name. Each property still tracks its own amounts/receipts
    // against its own copy of the row; only the name is shared.
    const getOtherActiveProperties = async (): Promise<Property[]> => {
        if (!property) return [];
        const allProperties = await getProperties(property.userId);
        return allProperties.filter((p) => p.propertyId !== property.propertyId && !p.archivedAt);
    };

    const syncCategoryToOtherProperties = async (label: string) => {
        const otherProperties = await getOtherActiveProperties();
        if (otherProperties.length === 0) return;

        const normalized = label.trim().toLowerCase();
        const results = await Promise.all(otherProperties.map(async (p) => {
            const existingCategories = await getTaxExpenseCategoriesByProperty(p.propertyId);
            if (existingCategories.some((c) => c.label.trim().toLowerCase() === normalized)) return false;
            const created = await createTaxExpenseCategory({
                propertyId: p.propertyId,
                sortOrder: existingCategories.length,
                label,
                amount: 0,
                elsterReference: null,
            });
            return created !== null;
        }));
        const addedCount = results.filter(Boolean).length;
        if (addedCount > 0) {
            showToast(`Kategorie "${label}" zu ${addedCount} weiteren Objekt${addedCount === 1 ? '' : 'en'} hinzugefügt.`, 'success');
        }
    };

    const renameCategoryOnOtherProperties = async (oldLabel: string, newLabel: string) => {
        const otherProperties = await getOtherActiveProperties();
        if (otherProperties.length === 0) return;

        const normalizedOld = oldLabel.trim().toLowerCase();
        const results = await Promise.all(otherProperties.map(async (p) => {
            const existingCategories = await getTaxExpenseCategoriesByProperty(p.propertyId);
            const match = existingCategories.find((c) => c.label.trim().toLowerCase() === normalizedOld);
            if (!match) return false;
            const updated = await updateTaxExpenseCategory(match.taxExpenseCategoryId, { label: newLabel });
            return updated !== null;
        }));
        const renamedCount = results.filter(Boolean).length;
        if (renamedCount > 0) {
            showToast(`Kategorie in ${renamedCount} weiteren Objekt${renamedCount === 1 ? '' : 'en'} ebenfalls umbenannt.`, 'success');
        }
    };

    const deleteCategoryOnOtherProperties = async (label: string) => {
        const otherProperties = await getOtherActiveProperties();
        if (otherProperties.length === 0) return;

        const normalized = label.trim().toLowerCase();
        const results = await Promise.all(otherProperties.map(async (p) => {
            const existingCategories = await getTaxExpenseCategoriesByProperty(p.propertyId);
            const match = existingCategories.find((c) => c.label.trim().toLowerCase() === normalized);
            if (!match) return false;
            return deleteTaxExpenseCategory(match.taxExpenseCategoryId);
        }));
        const deletedCount = results.filter(Boolean).length;
        if (deletedCount > 0) {
            showToast(`Kategorie in ${deletedCount} weiteren Objekt${deletedCount === 1 ? '' : 'en'} ebenfalls gelöscht.`, 'success');
        }
    };

    const persistLabel = async (categoryId: number, label: string) => {
        // A blank name is never written to the DB — it stays a local-only
        // draft (showing the "Neue Kategorie" placeholder) until the user
        // actually types something, rather than persisting an empty label.
        if (!label.trim()) return;
        const previousLabel = persistedLabelsRef.current.get(categoryId) ?? '';
        const updated = await updateTaxExpenseCategory(categoryId, { label });
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        persistedLabelsRef.current.set(categoryId, updated.label);
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, category: updated } : row));
        if (!previousLabel.trim()) {
            // A category named for the first time (empty label being
            // replaced) is a new addition — create it elsewhere too.
            void syncCategoryToOtherProperties(updated.label);
        } else if (previousLabel.trim().toLowerCase() !== label.trim().toLowerCase()) {
            // An already-named category being renamed — rename the
            // matching one on every other property instead.
            void renameCategoryOnOtherProperties(previousLabel, updated.label);
        }
    };

    const toggleCategoryComplete = async (categoryId: number) => {
        const current = rows.find((row) => row.category.taxExpenseCategoryId === categoryId)?.category;
        if (!current) return;
        const updated = await updateTaxExpenseCategory(categoryId, { manuallyComplete: !current.manuallyComplete });
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, category: updated } : row));
        showToast(updated.manuallyComplete ? 'Kategorie als vollständig markiert.' : 'Markierung als vollständig entfernt.', 'success');
    };

    const addCategory = async () => {
        if (!property) return;
        const created = await createTaxExpenseCategory({
            propertyId: property.propertyId,
            sortOrder: rows.length,
            // Left blank so the row shows the "Neue Kategorie" placeholder
            // instead of that literal text as an actual, must-be-deleted value.
            label: '',
            amount: 0,
            elsterReference: null,
        });
        if (!created) {
            showToast('Kategorie konnte nicht angelegt werden.', 'error');
            return;
        }
        persistedLabelsRef.current.set(created.taxExpenseCategoryId, created.label);
        setRows((prev) => [...prev, { category: created, documents: [], isUploading: false }]);
    };

    const confirmDeleteCategory = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const success = await deleteTaxExpenseCategory(pendingDelete.taxExpenseCategoryId);
            if (!success) {
                showToast('Kategorie konnte nicht gelöscht werden.', 'error');
                return;
            }
            setRows((prev) => prev.filter((row) => row.category.taxExpenseCategoryId !== pendingDelete.taxExpenseCategoryId));
            persistedLabelsRef.current.delete(pendingDelete.taxExpenseCategoryId);
            setPendingDelete(null);
            if (pendingDelete.label.trim()) void deleteCategoryOnOtherProperties(pendingDelete.label);
        } finally {
            setIsDeleting(false);
        }
    };

    // The category's amount is never typed in directly — every upload asks
    // "how much does this receipt add" and the server bumps the category's
    // running total by that amount in the same request.
    const addDocument = async (categoryId: number, file: File, amount: number) => {
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, isUploading: true } : row));
        const result = await uploadTaxExpenseDocument(categoryId, file, amount);
        if (!result) {
            showToast('Beleg konnte nicht hochgeladen werden.', 'error');
            setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, isUploading: false } : row));
            return false;
        }
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId
            ? { ...row, isUploading: false, category: result.category, documents: [...row.documents, result.document] }
            : row));
        return true;
    };

    const removeDocument = async (categoryId: number, document: TaxExpenseDocument) => {
        const result = await deleteTaxExpenseDocument(document.taxExpenseDocumentId);
        if (!result) {
            showToast('Beleg konnte nicht gelöscht werden.', 'error');
            return;
        }
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId
            ? { ...row, category: result.category, documents: row.documents.filter((d) => d.taxExpenseDocumentId !== document.taxExpenseDocumentId) }
            : row));
    };

    const viewDocument = async (document: TaxExpenseDocument) => {
        const url = await getTaxExpenseDocumentUrl(document.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const hasMultipleUnits = units.length > 1;
    const contextUnit = contextUnitId ? units.find((u) => u.propertyUnitId === Number(contextUnitId)) ?? null : null;

    return {
        property,
        rows,
        isLoading,
        hasMultipleUnits,
        contextUnit,
        selectedYear,
        setSelectedYear,
        availableYears,
        addYear,
        yearSummaries: visibleYearSummaries,
        archivedYears,
        archivedYearCount: yearSummaries.length - visibleYearSummaries.length,
        showArchivedYears,
        setShowArchivedYears,
        archiveYear,
        unarchiveYear,
        pendingDeleteYear,
        isDeletingYear,
        requestDeleteYear,
        cancelDeleteYear,
        confirmDeleteYear,
        currentYearBreakdown,
        isCategoryUploading,
        hasEmptyCategoryLabel,
        pendingDelete,
        isDeleting,
        setPendingDelete,
        updateLocalLabel,
        persistLabel,
        toggleCategoryComplete,
        addCategory,
        confirmDeleteCategory,
        addDocument,
        removeDocument,
        viewDocument,
    };
}
