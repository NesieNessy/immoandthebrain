"use client";

import { Dropdown, LoadingScreen, ReadOnlyField, StickyActionBar, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import { formatDecimalInput, parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import {
  computeFinancing,
  computeIndividualAdditionalCosts,
  type FinancingComputed,
  type FinancingVariant,
  type InterestPeriodYears,
} from '@/lib/detailCheck/financing';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type ColumnForm = {
  purchasePrice: string;
  parkingPrice: string;
  additionalCosts: string;
  renovationCosts: string;
  equity: string;
  interestPeriodYears: string;
};

type ApiColumn = {
  purchasePrice: number;
  parkingPrice: number;
  additionalCosts: number;
  renovationCosts: number;
  equity: number;
  interestPeriodYears: InterestPeriodYears;
  computed: FinancingComputed;
};

type ApiPayload = {
  selectedVariant: FinancingVariant;
  repaymentRate: number;
  interestAdjustmentFactor: number;
  offer: ApiColumn;
  individual: ApiColumn;
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const periodOptions = [
  { value: '10', label: '10 Jahre' },
  { value: '15', label: '15 Jahre' },
  { value: '20', label: '20 Jahre' },
];

const variantOptions = [
  { value: '', label: 'Bitte wählen...' },
  { value: 'OFFER', label: 'Angebot' },
  { value: 'INDIVIDUAL', label: 'Individuell' },
];

function valueString(value: number | string | null | undefined): string {
  if (value == null) return '';
  return formatDecimalInput(String(value));
}

function money(value: number): string {
  return currencyFormatter.format(value);
}

function percent(value: number): string {
  return percentFormatter.format(value);
}

function ReadOnlyMoney({ value, bold = false }: { value: number; bold?: boolean }) {
  return <ReadOnlyField value={money(value)} suffix="€" align="right" emphasis={bold} />;
}

function ReadOnlyPercent({ value }: { value: number }) {
  return <ReadOnlyField value={percent(value)} suffix="%" align="right" />;
}

function MoneyInput({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <TextField
      value={value}
      inputMode="decimal"
      suffix="€"
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onChange(formatDecimalInput(value))}
      readOnly={readOnly}
      className={readOnly ? 'bg-muted text-right' : 'text-right'}
    />
  );
}

function toYears(value: string): InterestPeriodYears {
  return value === '15' || value === '20' ? Number(value) as InterestPeriodYears : 10;
}

function FinancingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [offer, setOffer] = useState<ColumnForm>({
    purchasePrice: '0',
    parkingPrice: '0',
    additionalCosts: '0',
    renovationCosts: '0',
    equity: '0',
    interestPeriodYears: '10',
  });
  const [individual, setIndividual] = useState<ColumnForm>({
    purchasePrice: '0',
    parkingPrice: '0',
    additionalCosts: '0',
    renovationCosts: '0',
    equity: '0',
    interestPeriodYears: '10',
  });
  const [selectedVariant, setSelectedVariant] = useState<FinancingVariant | ''>('OFFER');
  const [repaymentRateInput, setRepaymentRateInput] = useState('2');
  const [interestAdjustmentFactor, setInterestAdjustmentFactor] = useState(1);
  const [offerInterestRate, setOfferInterestRate] = useState<number | null>(null);
  const [individualInterestRate, setIndividualInterestRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costPercentages, setCostPercentages] = useState({
    brokerPercent: 3.57,
    notaryPercent: 1.5,
    landRegistryPercent: 0.5,
    propertyTransferTaxPercent: null as number | null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [financingRes, acquisitionRes] = await Promise.all([
          authFetch(`/api/detail-check/financing${suffix}`, { cache: 'no-store' }),
          authFetch(`/api/detail-check/acquisition-costs${suffix}`, { cache: 'no-store' }),
        ]);
        if (!financingRes.ok) throw new Error(await financingRes.text());
        if (!acquisitionRes.ok) throw new Error(await acquisitionRes.text());
        const data = await financingRes.json() as ApiPayload;
        const acquisition = await acquisitionRes.json();
        if (cancelled) return;

        setSelectedVariant(data.selectedVariant);
        setRepaymentRateInput(valueString(data.repaymentRate));
        setInterestAdjustmentFactor(data.interestAdjustmentFactor);
        setOfferInterestRate(data.offer.computed.interestRate);
        setIndividualInterestRate(data.individual.computed.interestRate);
        setCostPercentages({
          brokerPercent: acquisition.brokerPercent,
          notaryPercent: acquisition.notaryPercent,
          landRegistryPercent: acquisition.landRegistryPercent,
          propertyTransferTaxPercent: acquisition.propertyTransferTaxPercent,
        });
        setOffer({
          purchasePrice: valueString(data.offer.purchasePrice),
          parkingPrice: valueString(data.offer.parkingPrice),
          additionalCosts: valueString(data.offer.additionalCosts),
          renovationCosts: valueString(data.offer.renovationCosts),
          equity: valueString(data.offer.equity),
          interestPeriodYears: String(data.offer.interestPeriodYears),
        });
        setIndividual({
          purchasePrice: valueString(data.individual.purchasePrice),
          parkingPrice: valueString(data.individual.parkingPrice),
          additionalCosts: valueString(data.individual.additionalCosts),
          renovationCosts: valueString(data.individual.renovationCosts),
          equity: valueString(data.individual.equity),
          interestPeriodYears: String(data.individual.interestPeriodYears),
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Finanzierung konnte nicht geladen werden.');
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

  const repaymentRate = Math.max(0, Math.min(20, parseDecimalInput(repaymentRateInput)));
  const repaymentRateError = parseDecimalInput(repaymentRateInput) < 0 || parseDecimalInput(repaymentRateInput) > 20
    ? 'Bitte einen Tilgungssatz zwischen 0 und 20 % eingeben.'
    : '';

  const offerValues = useMemo(() => ({
    purchasePrice: parseDecimalInput(offer.purchasePrice),
    parkingPrice: parseDecimalInput(offer.parkingPrice),
    additionalCosts: parseDecimalInput(offer.additionalCosts),
    renovationCosts: parseDecimalInput(offer.renovationCosts),
    equity: parseDecimalInput(offer.equity),
    interestPeriodYears: toYears(offer.interestPeriodYears),
  }), [offer]);

  const individualValues = useMemo(() => {
    const purchasePrice = parseDecimalInput(individual.purchasePrice);
    const parkingPrice = parseDecimalInput(individual.parkingPrice);
    return {
      purchasePrice,
      parkingPrice,
      additionalCosts: computeIndividualAdditionalCosts({
        purchasePrice,
        parkingPrice,
        ...costPercentages,
      }),
      renovationCosts: parseDecimalInput(individual.renovationCosts),
      equity: parseDecimalInput(individual.equity),
      interestPeriodYears: toYears(individual.interestPeriodYears),
    };
  }, [individual, costPercentages]);

  const offerBaseComputed = computeFinancing({
    ...offerValues,
    repaymentRate,
    interestAdjustmentFactor,
  });
  const individualBaseComputed = computeFinancing({
    ...individualValues,
    repaymentRate,
    interestAdjustmentFactor,
  });
  const withInterestRate = (computed: FinancingComputed, rate: number | null): FinancingComputed => {
    if (rate == null) return computed;
    return {
      ...computed,
      interestRate: rate,
      monthlyDebtService: Math.round(
        computed.loanAmount * ((rate + repaymentRate) / 100) / 12 * 100,
      ) / 100,
    };
  };
  const offerComputed = withInterestRate(offerBaseComputed, offerInterestRate);
  const individualComputed = withInterestRate(individualBaseComputed, individualInterestRate);

  const updateOffer = (field: keyof ColumnForm, value: string) => {
    setOffer((prev) => ({ ...prev, [field]: value }));
    if (field === 'interestPeriodYears') setOfferInterestRate(null);
  };
  const updateIndividual = (field: keyof ColumnForm, value: string) => {
    setIndividual((prev) => ({ ...prev, [field]: value }));
    if (field === 'interestPeriodYears') setIndividualInterestRate(null);
  };

  const persist = async (): Promise<boolean> => {
    if (isSaving || repaymentRateError) return false;
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/financing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          selectedVariant: selectedVariant || 'OFFER',
          repaymentRate,
          interestAdjustmentFactor,
          offer: {
            renovationCosts: offerValues.renovationCosts,
            equity: offerValues.equity,
            interestPeriodYears: offerValues.interestPeriodYears,
            interestRate: offerComputed.interestRate,
          },
          individual: {
            purchasePrice: individualValues.purchasePrice,
            parkingPrice: individualValues.parkingPrice,
            renovationCosts: individualValues.renovationCosts,
            equity: individualValues.equity,
            interestPeriodYears: individualValues.interestPeriodYears,
            interestRate: individualComputed.interestRate,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Finanzierung konnte nicht gespeichert werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndNavigate = async (path: string) => {
    if (await persist()) router.push(`${path}${suffix}`);
  };

  return (
    <PropertyValuationLayout currentStep={3} title="Finanzierung" beforeStepChange={persist} showFieldLegend>
      <div className="pb-24">

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingScreen message="Finanzierung wird geladen…" fullScreen={false} />
        ) : (
          <div className="space-y-7">
            <section>
              <div className="mb-4 flex items-center gap-4">
                <h2 className="rounded-lg border border-border bg-card px-4 py-2 text-lg font-medium text-foreground">
                  Finanzierungsparameter
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Tilgungssatz p.a."
                  value={repaymentRateInput}
                  inputMode="decimal"
                  suffix="%"
                  error={repaymentRateError}
                  helperText="Gemeinsame Annahme für Angebot und individuelle Finanzierung."
                  onChange={(event) => setRepaymentRateInput(event.target.value)}
                />
                <Dropdown
                  label="Womit möchten Sie weiter kalkulieren?"
                  options={variantOptions}
                  value={selectedVariant}
                  onChange={(event) => setSelectedVariant(event.target.value as FinancingVariant)}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Die gewählte Spalte wird in den Folgeschritten für Gesamtkosten, Eigenkapital, Darlehen, Zins und Kapitaldienst verwendet.
                </div>
                <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
                  Kapitaldienst pro Monat = Darlehenssumme × (Zins + Tilgungssatz) / 12.
                </div>
              </div>
            </section>

            <section>
              <div className="grid grid-cols-[minmax(180px,220px)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3">
                <div />
                <h2 className="text-center text-lg font-semibold text-foreground">Angebot</h2>
                <h2 className="text-center text-lg font-semibold text-foreground">Individuell</h2>

                <div className="self-center font-semibold text-foreground">Ermittelte Gesamtkosten:</div>
                <ReadOnlyMoney value={offerComputed.totalCosts} bold />
                <ReadOnlyMoney value={individualComputed.totalCosts} bold />

                <div className="self-center pl-4 text-foreground">Kaufpreis:</div>
                <ReadOnlyMoney value={offerValues.purchasePrice} />
                <MoneyInput value={individual.purchasePrice} onChange={(value) => updateIndividual('purchasePrice', value)} />

                <div className="self-center pl-4 text-foreground">Stellplatz / Stellplätze:</div>
                <ReadOnlyMoney value={offerValues.parkingPrice} />
                <MoneyInput value={individual.parkingPrice} onChange={(value) => updateIndividual('parkingPrice', value)} />

                <div className="self-center pl-4 text-foreground">Kaufnebenkosten gesamt:</div>
                <ReadOnlyMoney value={offerValues.additionalCosts} />
                <ReadOnlyMoney value={individualValues.additionalCosts} />

                <div className="self-center pl-4 text-foreground">Sanierungskosten:</div>
                <MoneyInput value={offer.renovationCosts} onChange={(value) => updateOffer('renovationCosts', value)} />
                <MoneyInput value={individual.renovationCosts} onChange={(value) => updateIndividual('renovationCosts', value)} />

                <div className="mt-6 self-center font-medium text-foreground">Anteil Eigenkapital:</div>
                <div className="mt-6"><MoneyInput value={offer.equity} onChange={(value) => updateOffer('equity', value)} /></div>
                <div className="mt-6"><MoneyInput value={individual.equity} onChange={(value) => updateIndividual('equity', value)} /></div>

                <div className="self-center font-medium text-foreground">Darlehenssumme €:</div>
                <ReadOnlyMoney value={offerComputed.loanAmount} />
                <ReadOnlyMoney value={individualComputed.loanAmount} />

                <div className="self-center font-medium text-foreground">Darlehenssumme %:</div>
                <ReadOnlyPercent value={offerComputed.loanToCostPercent} />
                <ReadOnlyPercent value={individualComputed.loanToCostPercent} />

                <div className="self-center font-medium text-foreground">Zinsbindung:</div>
                <Dropdown
                  options={periodOptions}
                  value={offer.interestPeriodYears}
                  onChange={(event) => updateOffer('interestPeriodYears', event.target.value)}
                />
                <Dropdown
                  options={periodOptions}
                  value={individual.interestPeriodYears}
                  onChange={(event) => updateIndividual('interestPeriodYears', event.target.value)}
                />

                <div className="self-center font-medium text-foreground">Ermittelter Zins (geschätzt):</div>
                <ReadOnlyPercent value={offerComputed.interestRate} />
                <ReadOnlyPercent value={individualComputed.interestRate} />

                <div className="self-center font-medium text-foreground">Kapitaldienst Monat (geschätzt):</div>
                <ReadOnlyMoney value={offerComputed.monthlyDebtService} />
                <ReadOnlyMoney value={individualComputed.monthlyDebtService} />
              </div>
            </section>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => void saveAndNavigate('/property-valuation/detail-check/leasing-or-rentals')}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving || !selectedVariant || Boolean(repaymentRateError)}
        onPrimary={() => void saveAndNavigate('/property-valuation/detail-check/depreciation')}
      />
    </PropertyValuationLayout>
  );
}

export default function FinancingPage() {
  return (
    <Suspense fallback={null}>
      <FinancingContent />
    </Suspense>
  );
}
