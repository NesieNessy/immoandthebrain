"use client";
import { useCallback, useEffect, useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, PAGE_CONTAINER_CLASS, Table, type TableColumn } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';

import { ServiceChargeSettlementView } from './ServiceChargeSettlementView';

export default function ServiceChargeSettlement({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        const id = parseInt(propertyId, 10);
        const [foundProperty, foundUnits] = await Promise.all([
            getPropertyById(id),
            getPropertyUnitsByProperty(id),
        ]);
        setProperty(foundProperty);
        setUnits(foundUnits);
        setIsLoading(false);
    }, [propertyId]);

    useEffect(() => {
        void load();
    }, [load]);


    if (isLoading) return <PropertyLoadingPage />;
    if (!property) return <PropertyNotFoundPage />;

    // Exactly one unit — skip the picker and go straight to it. The
    // settlement's cost data is property-wide either way (see the data hook);
    // this just decides whether a unit-picker step is needed first.
    if (units.length <= 1) {
        const unit = units[0];
        if (!unit) return <PropertyNotFoundPage />;
        return <ServiceChargeSettlementView propertyId={propertyId} property={property} unit={unit} hasMultipleUnits={false} />;
    }

    const columns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'unitLabel',
            label: 'Einheit',
            width: '40%',
            sortable: true,
            renderCell: (v) => <span className="font-medium text-foreground">{String(v)}</span>,
        },
        {
            key: 'livingAreaM2',
            label: 'Wohnfläche',
            sortable: true,
            align: 'right',
            renderCell: (v) => v != null ? `${v} m²` : '–',
        },
    ];

    const tableData = units.map((unit) => ({
        propertyUnitId: unit.propertyUnitId,
        unitLabel: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
        livingAreaM2: unit.livingAreaM2,
    }));

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.ServiceChargeSettlement)}
                />

                <div>
                    <Table
                        columns={columns}
                        data={tableData}
                        onRowClick={(row) => router.push(`/existing-properties/${propertyId}/service-charge-settlement/${row.propertyUnitId}`)}
                        footerLeft={`${tableData.length} Einträge`}
                    />
                </div>
            </main>
        </div>
    );
}
