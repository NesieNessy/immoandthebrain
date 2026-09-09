"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { ComingSoonButton, Dropdown, Header, PAGE_CONTAINER_CLASS, PillOptions, SectionLabel, StickyActionBar, UnsavedChangesModal, useToast } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import {
    computeRemainingUsefulLife,
    MODERNIZATION_FIELDS,
    MODERNIZATION_OPTIONS,
    type ModernizationSelections,
} from '@/lib/detailCheck/depreciation';
import { getPropertyRndByProperty, upsertPropertyRnd } from '@/lib/supabase/property_rnd.supabase';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { cn, deNumberFormatter } from '@/lib/utils';
import type { Property, RndMode } from '@immonext/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const RND_MODE_OPTIONS = [
    { value: 'STANDARD', label: 'Standard (50 Jahre)' },
    { value: 'INDIVIDUAL', label: 'Individuell prüfen' },
];

const EMPTY_MODERNIZATION: ModernizationSelections = {
    modernizationRoof: '',
    modernizationWindows: '',
    modernizationLines: '',
    modernizationHeating: '',
    modernizationFacade: '',
    modernizationBathrooms: '',
    modernizationInterior: '',
};

export default function AdjustRnd({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const { showToast } = useToast();

    const [rndMode, setRndMode] = useState<RndMode>('STANDARD');
    const [modernization, setModernization] = useState<ModernizationSelections>(EMPTY_MODERNIZATION);

    const [originalRndMode, setOriginalRndMode] = useState<RndMode>('STANDARD');
    const [originalModernization, setOriginalModernization] = useState<ModernizationSelections>(EMPTY_MODERNIZATION);

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [property, setProperty] = useState<Property | undefined>(undefined);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getPropertyById(parseInt(propertyId, 10)).then(p => {
            setProperty(p ?? undefined);
            setIsLoading(false);
        });

        getPropertyRndByProperty(parseInt(propertyId, 10)).then((rnd) => {
            if (!rnd) return;
            const loadedModernization: ModernizationSelections = {
                modernizationRoof: rnd.modernizationRoof ?? '',
                modernizationWindows: rnd.modernizationWindows ?? '',
                modernizationLines: rnd.modernizationLines ?? '',
                modernizationHeating: rnd.modernizationHeating ?? '',
                modernizationFacade: rnd.modernizationFacade ?? '',
                modernizationBathrooms: rnd.modernizationBathrooms ?? '',
                modernizationInterior: rnd.modernizationInterior ?? '',
            };
            setRndMode(rnd.rndMode);
            setOriginalRndMode(rnd.rndMode);
            setModernization(loadedModernization);
            setOriginalModernization(loadedModernization);
        });
    }, [propertyId]);

    useEffect(() => {
        const hasChanges =
            rndMode !== originalRndMode ||
            JSON.stringify(modernization) !== JSON.stringify(originalModernization);

        setIsEditing(hasChanges);
    }, [rndMode, modernization, originalRndMode, originalModernization]);

    // Any navigation away from an unsaved edit is routed through here so it
    // can be confirmed first (breadcrumb links, the cancel button, use-case menu).
    const goTo = (href: string) => {
        if (isEditing) {
            setPendingHref(href);
        } else {
            router.push(href);
        }
    };

    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };

    const individualRnd = useMemo(() => {
        if (!property) return null;
        return computeRemainingUsefulLife({
            category: property.propertyCategory,
            yearOfConstruction: property.yearOfConstruction,
            selections: modernization,
        });
    }, [property, modernization]);

    const selectedRnd = rndMode === 'STANDARD'
        ? { remainingUsefulLifeYears: 50, afaPercent: 2 }
        : individualRnd;

    const handleSave = async () => {
        if (!property) return;

        // Standard mode ignores modernization entirely, so don't carry stale
        // individual selections (or their derived RND/AfA) forward once saved.
        const savedModernization = rndMode === 'STANDARD' ? EMPTY_MODERNIZATION : modernization;
        const savedRnd = rndMode === 'STANDARD'
            ? { remainingUsefulLifeYears: 50, afaPercent: 2 }
            : computeRemainingUsefulLife({
                category: property.propertyCategory,
                yearOfConstruction: property.yearOfConstruction,
                selections: savedModernization,
            });

        setIsSaving(true);
        const saved = await upsertPropertyRnd({
            propertyId: parseInt(propertyId, 10),
            rndMode,
            modernizationRoof: savedModernization.modernizationRoof || null,
            modernizationWindows: savedModernization.modernizationWindows || null,
            modernizationLines: savedModernization.modernizationLines || null,
            modernizationHeating: savedModernization.modernizationHeating || null,
            modernizationFacade: savedModernization.modernizationFacade || null,
            modernizationBathrooms: savedModernization.modernizationBathrooms || null,
            modernizationInterior: savedModernization.modernizationInterior || null,
            remainingUsefulLifeYears: savedRnd.remainingUsefulLifeYears,
            afaPercent: savedRnd.afaPercent,
        });
        setIsSaving(false);
        if (!saved) return;

        setModernization(savedModernization);
        setOriginalRndMode(rndMode);
        setOriginalModernization(savedModernization);
        setIsEditing(false);
        showToast('Restnutzungsdauer gespeichert.');
        router.push(`/existing-properties/${propertyId}`);
    };

    const handleCancel = () => {
        goTo(`/existing-properties/${propertyId}`);
    };

    if (isLoading) return <PropertyLoadingPage />;

    if (!property) return <PropertyNotFoundPage />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[
                        {
                            label: 'Bestandsobjekte',
                            href: '/existing-properties',
                            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo('/existing-properties'); } },
                        },
                        {
                            label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
                            href: `/existing-properties/${propertyId}`,
                            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo(`/existing-properties/${propertyId}`); } },
                        },
                        { label: ExistingPropertiesUseCases.RND },
                    ]}
                />

                <div>
                    <div className="space-y-6">
                        {/* Calculation Mode */}
                        <div>
                            <SectionLabel>Berechnungsmodus</SectionLabel>
                            <div className="pt-3">
                                <PillOptions
                                    size="md"
                                    options={RND_MODE_OPTIONS}
                                    value={rndMode}
                                    onChange={(value) => setRndMode(value as RndMode)}
                                />
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border border-border bg-muted/30">
                            <div className="flex gap-8 shrink-0">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">RND</p>
                                    <p className="text-lg font-semibold text-foreground">
                                        {selectedRnd ? `${deNumberFormatter.format(selectedRnd.remainingUsefulLifeYears)} Jahre` : '– Jahre'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">AfA</p>
                                    <p className="text-lg font-semibold text-foreground">
                                        {selectedRnd ? `${deNumberFormatter.format(selectedRnd.afaPercent)}%` : '– %'}
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground sm:text-right sm:ml-auto">
                                {rndMode === 'STANDARD'
                                    ? 'Standardwert gemäß gesetzlicher Regelung. Baujahr und Modernisierungen werden nicht berücksichtigt.'
                                    : 'Individuell ermittelt anhand von Baujahr, Objektkategorie und Modernisierungen.'}
                            </p>
                        </div>

                        {/* Renovation Section */}
                        {rndMode === 'INDIVIDUAL' && (
                            <div>
                                <SectionLabel>Modernisierungen</SectionLabel>
                                <div className="pt-3 flex items-center justify-end">
                                    <ComingSoonButton
                                        label={BUTTON_DETAILS.RequestAppraisal.label}
                                        icon={<BUTTON_DETAILS.RequestAppraisal.icon />}
                                        variant="outline"
                                        size="sm"
                                        hideLabelOnMobile
                                    />
                                </div>

                                <div className="mt-3 border border-border rounded-lg overflow-hidden">
                                    <div className="grid grid-cols-2 gap-4 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        <span>Maßnahme</span>
                                        <span>Zuletzt erneuert</span>
                                    </div>
                                    {MODERNIZATION_FIELDS.map(([field, label], index) => (
                                        <div
                                            key={field}
                                            className={cn(
                                                "grid grid-cols-2 items-center gap-4 px-4 py-3",
                                                index > 0 && "border-t border-border"
                                            )}
                                        >
                                            <span className="text-sm text-foreground">{label}</span>
                                            <Dropdown
                                                options={MODERNIZATION_OPTIONS}
                                                value={modernization[field]}
                                                onChange={(e) => setModernization((prev) => ({ ...prev, [field]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Sticky Action Bar */}
            <StickyActionBar
                show={true}
                onGhost={handleCancel}
                onPrimary={handleSave}
                ghostLabel={BUTTON_DETAILS.Back.label}
                primaryLabel="RND speichern"
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!isEditing || isSaving}
            />

            <UnsavedChangesModal
                open={pendingHref !== null}
                onCancel={() => setPendingHref(null)}
                onDiscard={confirmDiscard}
                context="an der Restnutzungsdauer"
            />
        </div>
    );
}
