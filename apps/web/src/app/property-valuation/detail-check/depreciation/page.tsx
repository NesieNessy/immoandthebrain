"use client";

import { ComingSoonButton, Dropdown, LoadingScreen, PillOptions, ReadOnlyField, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
import { PROPERTY_CATEGORY_LABEL } from '@/components/features/PropertyDisplay';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import { parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import {
  computePriceSplitIndividual,
  computeRemainingUsefulLife,
  MODERNIZATION_FIELDS,
  MODERNIZATION_OPTIONS,
  type DepreciationMode,
  type ModernizationSelections,
  type PriceSplitMode,
} from '@/lib/detailCheck/depreciation';
import { cn, deCurrencyFormatter, deNumberFormatter } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type DepreciationResponse = {
  depreciationMode: DepreciationMode;
  priceSplitMode: PriceSplitMode;
  modernization: ModernizationSelections;
  landReferenceValue: number;
  plotAreaM2: number;
  coOwnershipNumerator: number;
  coOwnershipDenominator: number;
  city: string;
  propertyCategory: string;
  yearOfConstruction: number;
  purchasePrice: number;
  standardRnd: { remainingUsefulLifeYears: number; afaPercent: number };
  individualRnd: { remainingUsefulLifeYears: number; afaPercent: number; modernizationPoints: number };
  standardSplit: {
    buildingValue: number;
    buildingSharePercent: number;
    landValue: number;
    landSharePercent: number;
  };
  individualSplit: {
    buildingValue: number;
    buildingSharePercent: number;
    landValue: number;
    landSharePercent: number;
  };
};

// Matches the mode toggle on the existing-property RND/Kaufpreisaufteilung
// editors (AdjustRnd, AdjustDistribution) exactly, so switching between
// setting these up for the first time here and adjusting them later on an
// existing property feels like the same control, not two different ones.
const RND_MODE_OPTIONS = [
  { value: 'STANDARD', label: 'Standard (50 Jahre)' },
  { value: 'INDIVIDUAL', label: 'Individuell prüfen' },
];

function valueString(value: number | string | null | undefined): string {
  if (value == null) return '';
  return String(value).replace('.', ',');
}

function DepreciationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [depreciationMode, setDepreciationMode] = useState<DepreciationMode>('STANDARD');
  const [priceSplitMode, setPriceSplitMode] = useState<PriceSplitMode>('STANDARD');
  const [modernization, setModernization] = useState<ModernizationSelections>({
    modernizationRoof: '',
    modernizationWindows: '',
    modernizationLines: '',
    modernizationHeating: '',
    modernizationFacade: '',
    modernizationBathrooms: '',
    modernizationInterior: '',
  });
  const [landReferenceValue, setLandReferenceValue] = useState('');
  const [plotAreaM2, setPlotAreaM2] = useState('');
  const [coOwnershipNumerator, setCoOwnershipNumerator] = useState('');
  const [coOwnershipDenominator, setCoOwnershipDenominator] = useState('');
  const [propertyCategory, setPropertyCategory] = useState('EIGENTUMSWOHNUNG');
  const [context, setContext] = useState<DepreciationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/depreciation${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as DepreciationResponse;
        if (cancelled) return;
        setContext(data);
        setDepreciationMode(data.depreciationMode);
        setPriceSplitMode(data.priceSplitMode);
        setModernization(data.modernization);
        setLandReferenceValue(valueString(data.landReferenceValue));
        setPlotAreaM2(valueString(data.plotAreaM2));
        setCoOwnershipNumerator(valueString(data.coOwnershipNumerator));
        setCoOwnershipDenominator(valueString(data.coOwnershipDenominator));
        setPropertyCategory(data.propertyCategory || 'EIGENTUMSWOHNUNG');
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Abschreibung konnte nicht geladen werden.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [suffix]);

  const individualRnd = useMemo(() => {
    if (!context) return null;
    if (!propertyCategory || MODERNIZATION_FIELDS.some(([field]) => !modernization[field])) return null;
    return computeRemainingUsefulLife({
      category: propertyCategory,
      yearOfConstruction: context.yearOfConstruction,
      selections: modernization,
    });
  }, [context, modernization, propertyCategory]);

  const individualSplit = useMemo(() => {
    if (!context) return null;
    return computePriceSplitIndividual({
      purchasePrice: context.purchasePrice,
      landReferenceValue: parseDecimalInput(landReferenceValue),
      plotAreaM2: parseDecimalInput(plotAreaM2),
      coOwnershipNumerator: parseDecimalInput(coOwnershipNumerator),
      coOwnershipDenominator: parseDecimalInput(coOwnershipDenominator),
    });
  }, [context, landReferenceValue, plotAreaM2, coOwnershipNumerator, coOwnershipDenominator]);

  const selectedRnd = depreciationMode === 'STANDARD'
    ? { remainingUsefulLifeYears: 50, afaPercent: 2 }
    : individualRnd;
  const selectedSplit = priceSplitMode === 'STANDARD'
    ? context?.standardSplit
    : individualSplit;

  // Dynamic label mirrors AdjustDistribution's own Standard pill exactly —
  // it doubles as the "which city default am I getting" indicator there, so
  // it needs to say the same thing here.
  const priceSplitModeOptions = [
    {
      value: 'STANDARD',
      label: context
        ? `Standard (${deNumberFormatter.format(context.standardSplit.buildingSharePercent)} / ${deNumberFormatter.format(context.standardSplit.landSharePercent)})`
        : 'Standard',
    },
    { value: 'INDIVIDUAL', label: 'Individuell berechnen' },
  ];

  const persist = async (): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/depreciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          propertyCategory,
          depreciationMode,
          priceSplitMode,
          modernization,
          landReferenceValue: parseDecimalInput(landReferenceValue),
          plotAreaM2: parseDecimalInput(plotAreaM2),
          coOwnershipNumerator: parseDecimalInput(coOwnershipNumerator),
          coOwnershipDenominator: parseDecimalInput(coOwnershipDenominator),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Abschreibung konnte nicht gespeichert werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndNavigate = async (path: string) => {
    if (await persist()) router.push(`${path}${suffix}`);
  };

  return (
    <PropertyValuationLayout
      currentStep={4}
      title="Restnutzungsdauer in Jahren"
      beforeStepChange={persist}
      showFieldLegend
    >
      <div className="pb-24">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading || !context || !selectedSplit ? (
          <LoadingScreen message="Abschreibung wird geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SectionLabel>Wohnart</SectionLabel>
              <div className="max-w-xl pt-1">
                <ReadOnlyField
                  value={PROPERTY_CATEGORY_LABEL[propertyCategory] ?? propertyCategory}
                  helperText="Übernommen aus den Objektdaten. Beeinflusst die individuelle Restnutzungsdauer."
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Berechnungsmodus</SectionLabel>
              <div className="pt-3">
                <PillOptions
                  size="md"
                  options={RND_MODE_OPTIONS}
                  value={depreciationMode}
                  onChange={(value) => setDepreciationMode(value as DepreciationMode)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
              <div className="flex shrink-0 gap-8">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">RND</p>
                  <p className="text-lg font-semibold text-foreground">
                    {selectedRnd ? `${deNumberFormatter.format(selectedRnd.remainingUsefulLifeYears)} Jahre` : '– Jahre'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">AfA</p>
                  <p className="text-lg font-semibold text-foreground">
                    {selectedRnd ? `${deNumberFormatter.format(selectedRnd.afaPercent)}%` : '– %'}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground sm:ml-auto sm:text-right">
                {depreciationMode === 'STANDARD'
                  ? 'Standardwert gemäß gesetzlicher Regelung. Baujahr und Modernisierungen werden nicht berücksichtigt.'
                  : selectedRnd
                    ? 'Individuell ermittelt anhand von Baujahr, Objektkategorie und Modernisierungen.'
                    : 'Bitte zunächst alle Modernisierungsangaben auswählen.'}
              </p>
            </div>

            {depreciationMode === 'INDIVIDUAL' && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Modernisierungen</SectionLabel>
                <div className="flex items-center justify-end pt-1">
                  <ComingSoonButton
                    label={BUTTON_DETAILS.RequestAppraisal.label}
                    icon={<BUTTON_DETAILS.RequestAppraisal.icon />}
                    variant="outline"
                    size="sm"
                    hideLabelOnMobile
                  />
                </div>
                <div className="mt-1 overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-2 gap-4 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        onChange={(event) =>
                          setModernization((prev) => ({ ...prev, [field]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <SectionLabel>Kaufpreisaufteilung</SectionLabel>
              <p className="pt-1 text-sm text-muted-foreground">
                Kaufpreis {deCurrencyFormatter.format(context.purchasePrice)} €
              </p>
              <div className="pt-2">
                <PillOptions
                  size="md"
                  options={priceSplitModeOptions}
                  value={priceSplitMode}
                  onChange={(value) => setPriceSplitMode(value as PriceSplitMode)}
                />
              </div>
            </div>

            {priceSplitMode === 'INDIVIDUAL' && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Grundstücksdaten</SectionLabel>
                <div className="grid gap-4 pt-1 md:grid-cols-4">
                  <TextField label="Grundstücksgröße" optional value={plotAreaM2} suffix="m²" inputMode="decimal" onChange={(e) => setPlotAreaM2(e.target.value)} />
                  <TextField label="Bodenrichtwert" optional value={landReferenceValue} suffix="€" inputMode="decimal" onChange={(e) => setLandReferenceValue(e.target.value)} />
                  <TextField label="Miteigentumsanteil Zähler" optional value={coOwnershipNumerator} inputMode="decimal" onChange={(e) => setCoOwnershipNumerator(e.target.value)} />
                  <TextField label="Miteigentumsanteil Nenner" optional value={coOwnershipDenominator} inputMode="decimal" onChange={(e) => setCoOwnershipDenominator(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <SectionLabel>Berechnete Aufteilung</SectionLabel>
              <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Gebäude</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-semibold text-foreground">
                      {deNumberFormatter.format(selectedSplit.buildingSharePercent)}
                      <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{deCurrencyFormatter.format(selectedSplit.buildingValue)} €</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Grund und Boden</p>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-semibold text-foreground">
                      {deNumberFormatter.format(selectedSplit.landSharePercent)}
                      <span className="ml-0.5 text-sm font-normal text-muted-foreground">%</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{deCurrencyFormatter.format(selectedSplit.landValue)} €</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => void saveAndNavigate('/property-valuation/detail-check/financing')}
        secondaryLabel={BUTTON_DETAILS.Skip.label}
        secondaryIcon={<BUTTON_DETAILS.Skip.icon />}
        onSecondary={() => router.push(`/property-valuation/detail-check/renovation${suffix}`)}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving}
        onPrimary={() => void saveAndNavigate('/property-valuation/detail-check/renovation')}
      />
    </PropertyValuationLayout>
  );
}

export default function DepreciationPage() {
  return (
    <Suspense fallback={null}>
      <DepreciationContent />
    </Suspense>
  );
}
