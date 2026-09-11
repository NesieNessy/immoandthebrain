"use client";

import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit, getTenancyById } from '@/lib/supabase/tenancy.supabase';
import { getTenancyDocumentsByTenancy } from '@/lib/supabase/tenancy_document.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import type { PersonalData, Property, PropertyUnit, Tenancy, TenancyDocument, TenancyPerson } from '@immoandthebrain/types';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

interface UnitDocumentGeneratorState {
    isLoading: boolean;
    notFound: boolean;
    property: Property | null;
    unit: PropertyUnit | null;
    /** Whether the property has more than one unit — decides the
     *  "Zurück" destination (units overview vs. straight to the unit). */
    hasMultipleUnits: boolean;
    tenancy: Tenancy | null;
    persons: TenancyPerson[];
    landlord: PersonalData | null | undefined;
    documents: TenancyDocument[];
}

const INITIAL_STATE: UnitDocumentGeneratorState = {
    isLoading: true,
    notFound: false,
    property: null,
    unit: null,
    hasMultipleUnits: false,
    tenancy: null,
    persons: [],
    landlord: undefined,
    documents: [],
};

/** Loads everything the Mieterbescheinigung/Mietvertrag generator pages
 *  need, independent of the (already-loaded) tenant-unit-detail page —
 *  these are their own routes, reached directly via the documents table.
 *  Pass `archivedTenancyId` when reached from the Mieterhistorie detail
 *  view — otherwise this always resolves to the unit's *current* tenancy,
 *  which would show the current tenant's Mieterbescheinigung instead of
 *  the moved-out tenant's own. */
export function useUnitDocumentGeneratorData(
    propertyId: string,
    unitId: string,
    userId: string | undefined,
    archivedTenancyId?: number,
): UnitDocumentGeneratorState & { setDocuments: Dispatch<SetStateAction<TenancyDocument[]>> } {
    const [state, setState] = useState<UnitDocumentGeneratorState>(INITIAL_STATE);

    useEffect(() => {
        let cancelled = false;
        const pId = parseInt(propertyId, 10);
        const uId = parseInt(unitId, 10);

        Promise.all([getPropertyById(pId), getPropertyUnitsByProperty(pId)]).then(async ([property, units]) => {
            if (cancelled) return;
            const unit = units.find((u) => u.propertyUnitId === uId) ?? null;
            if (!property || !unit) {
                setState((prev) => ({ ...prev, isLoading: false, notFound: true }));
                return;
            }

            const tenancy = archivedTenancyId != null
                ? await getTenancyById(archivedTenancyId)
                : await getCurrentTenancyByUnit(unit.propertyUnitId);
            const [persons, documents]: [TenancyPerson[], TenancyDocument[]] = tenancy
                ? await Promise.all([getTenancyPersonsByTenancy(tenancy.tenancyId), getTenancyDocumentsByTenancy(tenancy.tenancyId)])
                : [[], []];
            if (cancelled) return;

            setState((prev) => ({
                ...prev,
                isLoading: false,
                notFound: false,
                property,
                unit,
                hasMultipleUnits: units.length > 1,
                tenancy,
                persons,
                documents,
            }));
        });

        return () => { cancelled = true; };
    }, [propertyId, unitId, archivedTenancyId]);

    const setDocuments: Dispatch<SetStateAction<TenancyDocument[]>> = (update) => {
        setState((prev) => ({
            ...prev,
            documents: typeof update === 'function' ? (update as (prev: TenancyDocument[]) => TenancyDocument[])(prev.documents) : update,
        }));
    };

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getPersonalData(userId).then((data) => { if (!cancelled) setState((prev) => ({ ...prev, landlord: data ?? null })); });
        return () => { cancelled = true; };
    }, [userId]);

    return { ...state, setDocuments };
}
