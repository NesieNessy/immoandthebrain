"use client";

import { BESTANDSOBJEKTE_BREADCRUMB_ROOT, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, PAGE_CONTAINER_CLASS } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Reached without a unit in the URL (e.g. the use-case switcher menu, which
 * doesn't carry unit context) — Objektentwicklung proposals are always
 * computed against one unit's tenancy, so this hands off to it: straight
 * through with exactly one unit, a picker with several, a hint with none.
 */
export default function RentalTrendsEntry({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        Promise.all([getPropertyById(id), getPropertyUnitsByProperty(id)]).then(([foundProperty, foundUnits]) => {
            setProperty(foundProperty);
            setUnits(foundUnits);
            setIsLoading(false);
        });
    }, [propertyId]);

    useEffect(() => {
        if (!isLoading && units.length === 1) {
            router.replace(`/existing-properties/${propertyId}/rental-trends/${units[0].propertyUnitId}`);
        }
    }, [isLoading, units, propertyId, router]);

    if (isLoading || (!isLoading && units.length === 1)) return <PropertyLoadingPage />;
    if (!property) return <PropertyNotFoundPage />;

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[
                        BESTANDSOBJEKTE_BREADCRUMB_ROOT,
                        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}` },
                    ]}
                />
                {units.length === 0 ? (
                    <p className="mt-6 text-sm text-muted-foreground">
                        Für dieses Objekt ist noch keine Einheit angelegt.
                    </p>
                ) : (
                    <div className="mt-6 flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">Für welche Einheit soll die Weiterentwicklung angezeigt werden?</p>
                        {units.map((unit) => (
                            <button
                                key={unit.propertyUnitId}
                                type="button"
                                onClick={() => router.push(`/existing-properties/${propertyId}/rental-trends/${unit.propertyUnitId}`)}
                                className="text-left p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer text-sm font-medium text-foreground"
                            >
                                {formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote)}
                            </button>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
