"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { propertyResourceRequest } from '@/lib/api/propertyResources';
import { getProperties } from '@/lib/supabase/property.supabase';
import { getTaxExpenseCategoriesByUser } from '@/lib/supabase/tax_expense_category.supabase';
import { getTaxExpenseDocumentsByUser, getTaxExpenseDocumentUrl, uploadTaxExpenseDocument } from '@/lib/supabase/tax_expense_document.supabase';
import { ensureDefaultTaxExpenseCategories } from '@/lib/taxExpense/defaultCategories';
import { availableTaxYears, summarizeTaxYear, type TaxCompletionStatus, type TaxYearCategoryBreakdown } from '@/lib/taxExpense/taxYearSummary';
import type { Property, TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type TaxOverviewCategoryRow = TaxYearCategoryBreakdown;
export type TaxOverviewStatus = TaxCompletionStatus;

export interface TaxOverviewPropertyRow {
    propertyId: number;
    label: string;
    unitsCount: number;
    totalAmount: number;
    categories: TaxOverviewCategoryRow[];
    missingCount: number;
    status: TaxOverviewStatus;
}

function propertyLabel(property: Property): string {
    return `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
}

export function useTaxOverviewData() {
    const { user } = useRequireAuth();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [properties, setProperties] = useState<Property[]>([]);
    const [unitCountByProperty, setUnitCountByProperty] = useState<Map<number, number>>(new Map());
    const [categories, setCategories] = useState<TaxExpenseCategory[]>([]);
    const [documents, setDocuments] = useState<TaxExpenseDocument[]>([]);
    const [year, setYear] = useState<number | null>(null);

    const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadAmount, setUploadAmount] = useState('');
    const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        const [allProperties, cats, docs, unitsRaw] = await Promise.all([
            getProperties(user.id),
            getTaxExpenseCategoriesByUser(),
            getTaxExpenseDocumentsByUser(),
            propertyResourceRequest<Record<string, unknown>[]>('property-units'),
        ]);
        const activeProperties = allProperties.filter((p) => !p.archivedAt).sort((a, b) => propertyLabel(a).localeCompare(propertyLabel(b)));
        const unitCounts = new Map<number, number>();
        for (const row of unitsRaw ?? []) {
            const propertyId = row.property_id as number;
            unitCounts.set(propertyId, (unitCounts.get(propertyId) ?? 0) + 1);
        }

        // Every property is guaranteed to show the reference default
        // categories here too, not just once its own Steuerunterlagen page
        // has been individually opened — tops up whichever are missing.
        const categoriesByProperty = new Map<number, TaxExpenseCategory[]>();
        for (const c of cats) {
            if (!categoriesByProperty.has(c.propertyId)) categoriesByProperty.set(c.propertyId, []);
            categoriesByProperty.get(c.propertyId)!.push(c);
        }
        const ensuredCategorySets = await Promise.all(activeProperties.map((p) =>
            ensureDefaultTaxExpenseCategories(p.propertyId, categoriesByProperty.get(p.propertyId) ?? []),
        ));
        const allCategories = ensuredCategorySets.flat();

        setProperties(activeProperties);
        setUnitCountByProperty(unitCounts);
        setCategories(allCategories);
        setDocuments(docs);
        setYear((current) => {
            if (current != null) return current;
            const years = docs.map((d) => new Date(d.createdAt).getFullYear());
            const currentYear = new Date().getFullYear();
            return years.length > 0 ? Math.max(...years, currentYear) : currentYear;
        });
        setIsLoading(false);
    }, [user]);

    useEffect(() => { void load(); }, [load]);

    // Every year that has at least one receipt, plus whichever year is
    // currently selected (`year`'s own fallback below can land on a year
    // with no documents at all, e.g. the current year for a first-time
    // user — the dropdown must always have a matching <option> for its
    // `value`, or the browser renders it blank instead of showing that
    // year), descending. availableTaxYears itself no longer force-includes
    // the current year (see its own doc comment) — that fallback is applied
    // per-consumer here and in useTaxDocumentsData instead.
    const availableYears = useMemo(() => {
        const years = new Set(availableTaxYears(documents));
        if (year != null) years.add(year);
        if (years.size === 0) years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [documents, year]);

    const propertyRows: TaxOverviewPropertyRow[] = useMemo(() => {
        if (year == null) return [];
        const categoriesByProperty = new Map<number, TaxExpenseCategory[]>();
        for (const c of categories) {
            if (!categoriesByProperty.has(c.propertyId)) categoriesByProperty.set(c.propertyId, []);
            categoriesByProperty.get(c.propertyId)!.push(c);
        }
        const documentsByProperty = new Map<number, TaxExpenseDocument[]>();
        for (const d of documents) {
            if (!documentsByProperty.has(d.propertyId)) documentsByProperty.set(d.propertyId, []);
            documentsByProperty.get(d.propertyId)!.push(d);
        }

        return properties.map((property) => {
            const breakdown = summarizeTaxYear(
                categoriesByProperty.get(property.propertyId) ?? [],
                documentsByProperty.get(property.propertyId) ?? [],
                year,
            );
            return {
                propertyId: property.propertyId,
                label: propertyLabel(property),
                unitsCount: unitCountByProperty.get(property.propertyId) ?? 0,
                totalAmount: breakdown.totalAmount,
                categories: breakdown.categories,
                missingCount: breakdown.missingCount,
                status: breakdown.status,
            };
        });
    }, [properties, categories, documents, unitCountByProperty, year]);

    const kpis = useMemo(() => ({
        propertyCount: propertyRows.length,
        totalAmount: propertyRows.reduce((sum, p) => sum + p.totalAmount, 0),
        uploadedCount: propertyRows.reduce((sum, p) => sum + p.categories.reduce((s, c) => s + c.documents.length, 0), 0),
        missingCount: propertyRows.reduce((sum, p) => sum + p.missingCount, 0),
        completeCount: propertyRows.filter((p) => p.status === 'complete').length,
    }), [propertyRows]);

    const requestUpload = (categoryId: number) => {
        setUploadCategoryId(categoryId);
        setUploadFile(null);
        setUploadAmount('');
    };

    const closeUploadModal = () => {
        setUploadCategoryId(null);
        setUploadFile(null);
        setUploadAmount('');
    };

    const confirmUpload = async () => {
        if (uploadCategoryId == null || !uploadFile || Number(uploadAmount) <= 0) return;
        setIsSubmittingUpload(true);
        try {
            const result = await uploadTaxExpenseDocument(uploadCategoryId, uploadFile, Number(uploadAmount));
            if (!result) {
                showToast('Beleg konnte nicht hochgeladen werden.', 'error');
                return;
            }
            setDocuments((prev) => [...prev, result.document]);
            showToast('Beleg hochgeladen.', 'success');
            closeUploadModal();
        } finally {
            setIsSubmittingUpload(false);
        }
    };

    const viewDocument = async (storagePath: string) => {
        const url = await getTaxExpenseDocumentUrl(storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    return {
        isLoading,
        year,
        setYear,
        availableYears,
        properties: propertyRows,
        kpis,
        uploadCategoryId,
        uploadFile,
        setUploadFile,
        uploadAmount,
        setUploadAmount,
        isSubmittingUpload,
        requestUpload,
        closeUploadModal,
        confirmUpload,
        viewDocument,
    };
}
