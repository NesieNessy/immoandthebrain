"use client";
import { useEffect, useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, PAGE_CONTAINER_CLASS, Tile } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import type { Property } from '@immoandthebrain/types';

export default function KeyMetrics({ propertyId }: { propertyId: string }) {
    const [property, setProperty] = useState<Property | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getPropertyById(parseInt(propertyId, 10)).then((p) => {
            setProperty(p);
            setIsLoading(false);
        });
    }, [propertyId]);

    if (isLoading) return <PropertyLoadingPage />;

    if (!property) return <PropertyNotFoundPage />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.KeyMetrics)}
                />
                <div>
                    <Tile title={ExistingPropertiesUseCases.KeyMetrics}>
                        <div className="p-4"><p className="text-muted-foreground">Hier können Sie die Kennzahlen für diese Immobilie einsehen.</p></div>
                    </Tile>
                </div>
            </main>
        </div>
    );
}
