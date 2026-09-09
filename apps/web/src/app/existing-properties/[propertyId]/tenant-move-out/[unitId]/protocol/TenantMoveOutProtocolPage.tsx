"use client";
import { useEffect, useState } from 'react';

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, StickyActionBar, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';

import { useTenantMoveOutData } from '../../useTenantMoveOutData';

export default function TenantMoveOutProtocolPage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null | undefined>(undefined);
    const [unit, setUnit] = useState<PropertyUnit | null | undefined>(undefined);
    const [hasMultipleUnits, setHasMultipleUnits] = useState(false);

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

    return (
        <TenantMoveOutProtocolContent
            propertyId={propertyId}
            property={property}
            unit={unit}
            hasMultipleUnits={hasMultipleUnits}
            router={router}
        />
    );
}

function TenantMoveOutProtocolContent({
    propertyId,
    property,
    unit,
    hasMultipleUnits,
    router,
}: {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
    router: ReturnType<typeof useRouter>;
}) {
    const data = useTenantMoveOutData(propertyId, property, unit, hasMultipleUnits);

    useEffect(() => {
        if (!data.isLoading && data.previewHtml === null && data.canGenerateProtocol) {
            void data.handlePreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.isLoading, data.canGenerateProtocol]);

    if (data.isLoading) return <PropertyLoadingPage />;

    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);
    const moveOutHref = `/existing-properties/${propertyId}/tenant-move-out/${unit.propertyUnitId}`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(hasMultipleUnits
            ? [
                { label: unitLabel, href: `/existing-properties/${propertyId}/${unit.propertyUnitId}` },
                { label: 'Mieterauszug & Abnahmeprotokoll', href: moveOutHref },
            ]
            : [
                { label: 'Mieterauszug & Abnahmeprotokoll', href: moveOutHref },
            ]),
        { label: 'Abnahmeprotokoll generieren' },
    ];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={breadcrumbItems} />

                <div>
                    {!data.canGenerateProtocol ? (
                        <p className="text-sm text-muted-foreground">
                            Für diese Einheit ist aktuell kein Mieter hinterlegt.
                        </p>
                    ) : data.previewHtml ? (
                        <iframe
                            title="Abnahmeprotokoll Vorschau"
                            srcDoc={data.previewHtml}
                            className="w-full h-[75vh] rounded-md border border-border bg-white"
                        />
                    ) : (
                        <LoadingScreen message="Vorschau wird geladen…" fullScreen={false} />
                    )}
                </div>
            </main>

            <StickyActionBar
                show
                onGhost={() => router.push(moveOutHref)}
                onPrimary={() => void data.handleGenerateProtocol()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={data.isGeneratingProtocol ? 'Wird erstellt…' : 'Abnahmeprotokoll erstellen'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!data.canGenerateProtocol || data.isGeneratingProtocol}
            />
        </div>
    );
}
