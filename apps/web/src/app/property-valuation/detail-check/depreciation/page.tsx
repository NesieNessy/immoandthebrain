"use client";

import { Button, Dropdown, LoadingScreen, PillOptions, ReadOnlyField, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
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

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const residentialTypeOptions = [
  { value: 'EIGENTUMSWOHNUNG', label: 'Eigentumswohnung (= Mehrfamilienhaus)' },
  { value: 'HOLZBAUWEISE', label: 'Holzbauweise / minderer Standard' },
  { value: 'DENKMALGESCHUETZT', label: 'Denkmalgeschütztes Gebäude (Einzelfall)' },
];

const MODE_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'INDIVIDUAL', label: 'Individuell' },
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
      actions={
        <Button
          label="Überspringen"
          variant="outline"
          hideLabelOnMobile
          onClick={() => router.push(`/property-valuation/detail-check/renovation${suffix}`)}
        />
      }
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
            <div className="flex flex-col gap-2 max-w-xl">
              <SectionLabel>Wohnart</SectionLabel>
              <Dropdown
                options={residentialTypeOptions}
                value={propertyCategory}
                onChange={(event) => setPropertyCategory(event.target.value)}
                helperText="Die Wohnart beeinflusst die individuelle Restnutzungsdauer."
              />
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Berechnungsmodus</SectionLabel>
              <div className="grid gap-4 pt-1 md:grid-cols-[220px_1fr_1fr] md:items-center">
                <PillOptions
                  size="md"
                  options={MODE_OPTIONS}
                  value={depreciationMode}
                  onChange={(value) => setDepreciationMode(value as DepreciationMode)}
                />
                <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
                  <span>RND:</span>
                  <ReadOnlyField
                    value={selectedRnd ? numberFormatter.format(selectedRnd.remainingUsefulLifeYears) : '-'}
                    suffix="Jahre"
                    align="right"
                    helperText={!selectedRnd ? 'Bitte zunächst alle Modernisierungsangaben auswählen.' : undefined}
                  />
                </div>
                <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
                  <span>AfA:</span>
                  <ReadOnlyField value={selectedRnd ? numberFormatter.format(selectedRnd.afaPercent) : '-'} suffix="%" align="right" />
                </div>
              </div>
            </div>

            {depreciationMode === 'INDIVIDUAL' && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Modernisierungen</SectionLabel>
                <div className="grid gap-3 pt-1 md:grid-cols-[minmax(0,360px)_minmax(0,280px)_minmax(0,1fr)] md:items-center">
                  {MODERNIZATION_FIELDS.map(([field, label]) => (
                    <div key={field} className="contents">
                      <label className="text-sm text-foreground">
                        {label}
                        <span className="font-normal text-muted-foreground"> (optional)</span>
                      </label>
                      <Dropdown
                        options={MODERNIZATION_OPTIONS}
                        value={modernization[field]}
                        onChange={(event) =>
                          setModernization((prev) => ({ ...prev, [field]: event.target.value }))
                        }
                      />
                      <div />
                    </div>
                  ))}
                </div>
                <Button
                  label="Beauftragung RND-Gutachten"
                  variant="outline"
                  className="mt-1 self-start"
                  disabled
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <SectionLabel>Kaufpreisaufteilung</SectionLabel>
              <PillOptions
                size="md"
                options={MODE_OPTIONS}
                value={priceSplitMode}
                onChange={(value) => setPriceSplitMode(value as PriceSplitMode)}
              />
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
              <p className="pt-1 text-lg text-foreground">
                Für Ihre Stadt {context.city ? `(${context.city})` : ''} lautet die Aufteilung:
              </p>
              <div className="grid max-w-3xl gap-4 md:grid-cols-[220px_160px_220px] md:items-center">
                <div className="text-lg font-medium">Gebäude</div>
                <ReadOnlyField value={numberFormatter.format(selectedSplit.buildingSharePercent)} suffix="%" align="right" />
                <ReadOnlyField value={currencyFormatter.format(selectedSplit.buildingValue)} suffix="€" align="right" />
                <div className="text-lg font-medium">Grund und Boden</div>
                <ReadOnlyField value={numberFormatter.format(selectedSplit.landSharePercent)} suffix="%" align="right" />
                <ReadOnlyField value={currencyFormatter.format(selectedSplit.landValue)} suffix="€" align="right" />
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
