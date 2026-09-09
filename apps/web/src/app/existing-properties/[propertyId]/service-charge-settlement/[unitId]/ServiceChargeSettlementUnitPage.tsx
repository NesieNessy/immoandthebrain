"use client";
import { useEffect, useState } from 'react';

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import type { Property, PropertyUnit } from '@immoandthebrain/types';

import { ServiceChargeSettlementView } from '../ServiceChargeSettlementView';

export default function ServiceChargeSettlementUnitPage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const [property, setProperty] = useState<Property | null | undefined>(undefined);
    const [unit, setUnit] = useState<PropertyUnit | null | undefined>(undefined);
    const [hasMultipleUnits, setHasMultipleUnits] = useState(true);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        const targetUnitId = parseInt(unitId, 10);
        Promise.all([
            getPropertyById(id),
            getPropertyUnitsByProperty(id),
        ]).then(([foundProperty, units]) => {
            setProperty(foundProperty);
            setUnit(units.find((u) => u.propertyUnitId === targetUnitId) ?? null);
            setHasMultipleUnits(units.length > 1);
        });
    }, [propertyId, unitId]);

    if (property === undefined || unit === undefined) return <PropertyLoadingPage />;
    if (property === null || unit === null) return <PropertyNotFoundPage />;

    return <ServiceChargeSettlementView propertyId={propertyId} property={property} unit={unit} hasMultipleUnits={hasMultipleUnits} />;
}
