"use client";

import { useToast } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import {
    createTaxExpenseCategory,
    deleteTaxExpenseCategory,
    getTaxExpenseCategoriesByProperty,
    updateTaxExpenseCategory,
} from '@/lib/supabase/tax_expense_category.supabase';
import {
    deleteTaxExpenseDocument,
    getTaxExpenseDocumentsByCategory,
    getTaxExpenseDocumentUrl,
    uploadTaxExpenseDocument,
} from '@/lib/supabase/tax_expense_document.supabase';
import type { Property, TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

/** Every property starts with this set the first time Steuerunterlagen is
 *  opened — matching Fahrtkosten/Übernachtungskosten/etc. across the app's
 *  reference material — rather than making the user build the list from
 *  scratch. They're ordinary rows once created: rename, retotal, or delete
 *  freely, and "+ Kategorie hinzufügen" adds more the same way. */
const DEFAULT_CATEGORY_LABELS = ['Fahrtkosten', 'Übernachtungskosten', 'Mahlzeiten', 'Spesen', 'Reparaturen', 'Sonderumlagen'];

export interface CategoryRow {
    category: TaxExpenseCategory;
    documents: TaxExpenseDocument[];
    isUploading: boolean;
}

export function useTaxDocumentsData(propertyId: string) {
    const { showToast } = useToast();
    const [property, setProperty] = useState<Property | null>(null);
    const [rows, setRows] = useState<CategoryRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<TaxExpenseCategory | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;
        (async () => {
            const [foundProperty, foundCategories] = await Promise.all([
                getPropertyById(id),
                getTaxExpenseCategoriesByProperty(id),
            ]);
            if (cancelled) return;
            setProperty(foundProperty);

            let categories = foundCategories;
            if (foundProperty && foundCategories.length === 0) {
                const created = await Promise.all(DEFAULT_CATEGORY_LABELS.map((label, index) =>
                    createTaxExpenseCategory({ propertyId: id, sortOrder: index, label, amount: 0, elsterReference: null }),
                ));
                categories = created.filter((c): c is TaxExpenseCategory => c !== null);
            }
            if (cancelled) return;

            const documentsByCategory = await Promise.all(categories.map((c) => getTaxExpenseDocumentsByCategory(c.taxExpenseCategoryId)));
            if (cancelled) return;
            setRows(categories.map((category, index) => ({ category, documents: documentsByCategory[index], isUploading: false })));
            setIsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [propertyId]);

    const totalAmount = rows.reduce((sum, row) => sum + row.category.amount, 0);
    const totalDocuments = rows.reduce((sum, row) => sum + row.documents.length, 0);

    const updateLocalLabel = (categoryId: number, label: string) => {
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, category: { ...row.category, label } } : row));
    };

    const persistLabel = async (categoryId: number, label: string) => {
        const updated = await updateTaxExpenseCategory(categoryId, { label });
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        setRows((prev) => prev.map((row) => row.category.taxExpenseCategoryId === categoryId ? { ...row, category: updated } : row));
    };

    const addCategory = async () => {
        if (!property) return;
        const created = await createTaxExpenseCategory({
            propertyId: property.propertyId,
            sortOrder: rows.length,
            label: 'Neue Kategorie',
            amount: 0,
            elsterReference: null,
        });
        if (!created) {
            showToast('Kategorie konnte nicht angelegt werden.', 'error');
            return;
        }
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
            setPendingDelete(null);
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

    return {
        property,
        rows,
        isLoading,
        totalAmount,
        totalDocuments,
        pendingDelete,
        isDeleting,
        setPendingDelete,
        updateLocalLabel,
        persistLabel,
        addCategory,
        confirmDeleteCategory,
        addDocument,
        removeDocument,
        viewDocument,
    };
}
