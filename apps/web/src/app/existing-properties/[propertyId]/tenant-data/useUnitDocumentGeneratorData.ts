"use client";

import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit } from '@/lib/supabase/tenancy.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import type { PersonalData, Property, PropertyUnit, Tenancy, TenancyPerson } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

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
};

/** Loads everything the Mieterbescheinigung/Mietvertrag generator pages
 *  need, independent of the (already-loaded) tenant-unit-detail page —
 *  these are their own routes, reached directly via the documents table. */
export function useUnitDocumentGeneratorData(
    propertyId: string,
    unitId: string,
    userId: string | undefined,
): UnitDocumentGeneratorState {
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

            const tenancy = await getCurrentTenancyByUnit(unit.propertyUnitId);
            const persons = tenancy ? await getTenancyPersonsByTenancy(tenancy.tenancyId) : [];
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
            }));
        });

        return () => { cancelled = true; };
    }, [propertyId, unitId]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getPersonalData(userId).then((data) => { if (!cancelled) setState((prev) => ({ ...prev, landlord: data ?? null })); });
        return () => { cancelled = true; };
    }, [userId]);

    return state;
}
