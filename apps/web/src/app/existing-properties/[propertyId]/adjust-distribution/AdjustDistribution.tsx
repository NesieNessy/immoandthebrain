"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, Icons, NumberField, PAGE_CONTAINER_CLASS, PillOptions, SectionLabel, StickyActionBar, UnsavedChangesModal, useToast } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { computePriceSplitIndividual, computePriceSplitStandard } from '@/lib/detailCheck/depreciation';
import { getCityPurchasePriceSplit } from '@/lib/supabase/city_purchase_price_split.supabase';
import { getPropertyOverviewById, type PropertyOverview } from '@/lib/supabase/property.supabase';
import { getPropertyPriceSplitByProperty, upsertPropertyPriceSplit } from '@/lib/supabase/property_price_split.supabase';
import { deCurrencyFormatter, deNumberFormatter } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type SplitMode = 'STANDARD' | 'INDIVIDUAL';

export default function AdjustDistribution({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const { showToast } = useToast();
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    const [property, setProperty] = useState<PropertyOverview | undefined>(undefined);
    const [cityShare, setCityShare] = useState({ buildingSharePercent: 65, landSharePercent: 35 });

    const [splitMode, setSplitMode] = useState<SplitMode>('STANDARD');
    const [plotAreaM2, setPlotAreaM2] = useState('');
    const [landReferenceValue, setLandReferenceValue] = useState('');
    const [coOwnershipNumerator, setCoOwnershipNumerator] = useState('');
    const [coOwnershipDenominator, setCoOwnershipDenominator] = useState('');

    const [originalSplitMode, setOriginalSplitMode] = useState<SplitMode>('STANDARD');
    const [originalPlotAreaM2, setOriginalPlotAreaM2] = useState('');
    const [originalLandReferenceValue, setOriginalLandReferenceValue] = useState('');
    const [originalCoOwnershipNumerator, setOriginalCoOwnershipNumerator] = useState('');
    const [originalCoOwnershipDenominator, setOriginalCoOwnershipDenominator] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getPropertyOverviewById(parseInt(propertyId, 10)).then((p) => {
            setProperty(p ?? undefined);
            setIsLoading(false);
        });

        getPropertyPriceSplitByProperty(parseInt(propertyId, 10)).then((saved) => {
            if (!saved) return;
            const loadedMode = saved.splitMode;
            const loadedPlotAreaM2 = saved.plotAreaM2 != null ? String(saved.plotAreaM2) : '';
            const loadedLandReferenceValue = saved.landReferenceValue != null ? String(saved.landReferenceValue) : '';
            const loadedCoOwnershipNumerator = saved.coOwnershipNumerator != null ? String(saved.coOwnershipNumerator) : '';
            const loadedCoOwnershipDenominator = saved.coOwnershipDenominator != null ? String(saved.coOwnershipDenominator) : '';

            setSplitMode(loadedMode);
            setPlotAreaM2(loadedPlotAreaM2);
            setLandReferenceValue(loadedLandReferenceValue);
            setCoOwnershipNumerator(loadedCoOwnershipNumerator);
            setCoOwnershipDenominator(loadedCoOwnershipDenominator);

            setOriginalSplitMode(loadedMode);
            setOriginalPlotAreaM2(loadedPlotAreaM2);
            setOriginalLandReferenceValue(loadedLandReferenceValue);
            setOriginalCoOwnershipNumerator(loadedCoOwnershipNumerator);
            setOriginalCoOwnershipDenominator(loadedCoOwnershipDenominator);
        });
    }, [propertyId]);

    useEffect(() => {
        if (!property) return;
        getCityPurchasePriceSplit(property.city).then(setCityShare);
    }, [property]);

    const isEditing =
        splitMode !== originalSplitMode ||
        plotAreaM2 !== originalPlotAreaM2 ||
        landReferenceValue !== originalLandReferenceValue ||
        coOwnershipNumerator !== originalCoOwnershipNumerator ||
        coOwnershipDenominator !== originalCoOwnershipDenominator;

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

    const purchasePrice = property?.purchasePrice ?? 0;

    const standardSplit = useMemo(
        () => computePriceSplitStandard(purchasePrice, cityShare.buildingSharePercent),
        [purchasePrice, cityShare]
    );

    const individualSplit = useMemo(
        () => computePriceSplitIndividual({
            purchasePrice,
            landReferenceValue: Number(landReferenceValue) || 0,
            plotAreaM2: Number(plotAreaM2) || 0,
            coOwnershipNumerator: Number(coOwnershipNumerator) || 0,
            coOwnershipDenominator: Number(coOwnershipDenominator) || 0,
        }),
        [purchasePrice, landReferenceValue, plotAreaM2, coOwnershipNumerator, coOwnershipDenominator]
    );

    const selectedSplit = splitMode === 'STANDARD' ? standardSplit : individualSplit;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const saved = await upsertPropertyPriceSplit({
                propertyId: parseInt(propertyId, 10),
                splitMode,
                plotAreaM2: plotAreaM2 !== '' ? Number(plotAreaM2) : null,
                landReferenceValue: landReferenceValue !== '' ? Number(landReferenceValue) : null,
                coOwnershipNumerator: coOwnershipNumerator !== '' ? Number(coOwnershipNumerator) : null,
                coOwnershipDenominator: coOwnershipDenominator !== '' ? Number(coOwnershipDenominator) : null,
            });
            if (!saved) return;

            setOriginalSplitMode(splitMode);
            setOriginalPlotAreaM2(plotAreaM2);
            setOriginalLandReferenceValue(landReferenceValue);
            setOriginalCoOwnershipNumerator(coOwnershipNumerator);
            setOriginalCoOwnershipDenominator(coOwnershipDenominator);
            showToast('Kaufpreisaufteilung gespeichert.');
            router.push(`/existing-properties/${propertyId}`);
        } finally {
            setIsSaving(false);
        }
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
                        { label: ExistingPropertiesUseCases.SplitPurchasePrice },
                    ]}
                />

                <div className="space-y-6">
                    {/* Calculation Mode */}
                    <div>
                        <SectionLabel>Berechnungsmodus</SectionLabel>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Kaufpreis {deCurrencyFormatter.format(purchasePrice)} €
                        </p>
                        <div className="pt-3">
                            <PillOptions
                                size="md"
                                options={[
                                    { value: 'STANDARD', label: `Standard (${deNumberFormatter.format(standardSplit.buildingSharePercent)} / ${deNumberFormatter.format(standardSplit.landSharePercent)})` },
                                    { value: 'INDIVIDUAL', label: 'Individuell berechnen' },
                                ]}
                                value={splitMode}
                                onChange={(value) => setSplitMode(value as SplitMode)}
                            />
                        </div>
                    </div>

                    {/* Plot data — only relevant for individual calculation */}
                    {splitMode === 'INDIVIDUAL' && (
                        <div>
                            <SectionLabel>Grundstücksdaten</SectionLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                                <NumberField
                                    label="Grundstücksgröße"
                                    placeholder="7.500"
                                    unit="m²"
                                    value={plotAreaM2}
                                    onChange={(e) => setPlotAreaM2(e.target.value)}
                                    min={0}
                                />
                                <NumberField
                                    label="Bodenrichtwert"
                                    placeholder="5.000"
                                    unit="€/m²"
                                    value={landReferenceValue}
                                    onChange={(e) => setLandReferenceValue(e.target.value)}
                                    min={0}
                                />
                                <NumberField
                                    label="MEA Zähler"
                                    placeholder="100"
                                    value={coOwnershipNumerator}
                                    onChange={(e) => setCoOwnershipNumerator(e.target.value)}
                                    min={0}
                                />
                                <NumberField
                                    label="MEA Nenner"
                                    placeholder="10.000"
                                    value={coOwnershipDenominator}
                                    onChange={(e) => setCoOwnershipDenominator(e.target.value)}
                                    min={0}
                                />
                            </div>
                            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Icons.Info className="w-3.5 h-3.5 shrink-0 text-primary" />
                                Tragen Sie die Grundstücksdaten ein um die Aufteilung zu berechnen.
                            </p>
                        </div>
                    )}

                    {/* Result */}
                    <div>
                        <SectionLabel>Berechnete Aufteilung</SectionLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                            <div className="p-4 rounded-lg border border-border bg-card">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Gebäude</p>
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-2xl font-semibold text-foreground">
                                        {deNumberFormatter.format(selectedSplit.buildingSharePercent)}
                                        <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">{deCurrencyFormatter.format(selectedSplit.buildingValue)} €</p>
                                </div>
                            </div>
                            <div className="p-4 rounded-lg border border-border bg-card">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Grund und Boden</p>
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-2xl font-semibold text-foreground">
                                        {deNumberFormatter.format(selectedSplit.landSharePercent)}
                                        <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">{deCurrencyFormatter.format(selectedSplit.landValue)} €</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Sticky Action Bar */}
            <StickyActionBar
                show={true}
                onGhost={handleCancel}
                onPrimary={() => void handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                primaryLabel="Kaufpreisaufteilung speichern"
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!isEditing || isSaving}
            />

            <UnsavedChangesModal
                open={pendingHref !== null}
                onCancel={() => setPendingHref(null)}
                onDiscard={confirmDiscard}
                context="an der Kaufpreisaufteilung"
            />
        </div>
    );
}
