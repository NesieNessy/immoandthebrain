"use client";

import { Dropdown, Icons, LoadingScreen, PillOptions, ReadOnlyField, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
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
  { value: 'OFFER', label: 'Angebot verwenden' },
  { value: 'INDIVIDUAL', label: 'Individuell verwenden' },
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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SectionLabel>Finanzierungsparameter</SectionLabel>
              <div className="w-full sm:w-48">
                <TextField
                  label="Tilgungssatz p.a."
                  value={repaymentRateInput}
                  inputMode="decimal"
                  suffix="%"
                  pillSuffix
                  error={repaymentRateError}
                  onChange={(event) => setRepaymentRateInput(event.target.value)}
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary">
                    <Icons.Calculator className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Berechnungsgrundlage</span>
                </div>
                <p className="font-mono text-sm text-foreground">
                  Kapitaldienst / Monat = <span className="font-semibold text-primary">Darlehenssumme</span> × ( <span className="font-semibold text-primary">Zins</span> + <span className="font-semibold text-primary">Tilgungssatz</span> ) ÷ 12
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Angebot &amp; individuelle Kalkulation</SectionLabel>
              <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
                <div className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3">
                  <div />
                  <div className="pb-2 border-b border-border text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">Angebot</div>
                  <div className="pb-2 border-b border-border text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">Individuell</div>

                  <div className="self-center font-semibold text-foreground">Ermittelte Gesamtkosten</div>
                  <ReadOnlyMoney value={offerComputed.totalCosts} bold />
                  <ReadOnlyMoney value={individualComputed.totalCosts} bold />

                  <div className="self-center pl-4 text-sm text-muted-foreground">Kaufpreis</div>
                  <ReadOnlyMoney value={offerValues.purchasePrice} />
                  <MoneyInput value={individual.purchasePrice} onChange={(value) => updateIndividual('purchasePrice', value)} />

                  <div className="self-center pl-4 text-sm text-muted-foreground">Stellplatz / Stellplätze</div>
                  <ReadOnlyMoney value={offerValues.parkingPrice} />
                  <MoneyInput value={individual.parkingPrice} onChange={(value) => updateIndividual('parkingPrice', value)} />

                  <div className="self-center pl-4 text-sm text-muted-foreground">Kaufnebenkosten gesamt</div>
                  <ReadOnlyMoney value={offerValues.additionalCosts} />
                  <ReadOnlyMoney value={individualValues.additionalCosts} />

                  <div className="self-center pl-4 text-sm text-muted-foreground">Sanierungskosten</div>
                  <MoneyInput value={offer.renovationCosts} onChange={(value) => updateOffer('renovationCosts', value)} />
                  <MoneyInput value={individual.renovationCosts} onChange={(value) => updateIndividual('renovationCosts', value)} />

                  <div className="col-span-3 mt-1 pt-3 border-t border-border" />

                  <div className="self-center font-semibold text-foreground">Anteil Eigenkapital</div>
                  <MoneyInput value={offer.equity} onChange={(value) => updateOffer('equity', value)} />
                  <MoneyInput value={individual.equity} onChange={(value) => updateIndividual('equity', value)} />

                  <div className="self-center text-sm text-muted-foreground">Darlehenssumme</div>
                  <ReadOnlyMoney value={offerComputed.loanAmount} />
                  <ReadOnlyMoney value={individualComputed.loanAmount} />

                  <div className="self-center text-sm text-muted-foreground">Darlehensquote</div>
                  <ReadOnlyPercent value={offerComputed.loanToCostPercent} />
                  <ReadOnlyPercent value={individualComputed.loanToCostPercent} />

                  <div className="self-center text-sm text-muted-foreground">Zinsbindung</div>
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

                  <div className="self-center text-sm text-muted-foreground">Ermittelter Zins (geschätzt)</div>
                  <ReadOnlyPercent value={offerComputed.interestRate} />
                  <ReadOnlyPercent value={individualComputed.interestRate} />

                  <div className="self-center text-sm text-muted-foreground">Kapitaldienst Monat (geschätzt)</div>
                  <ReadOnlyMoney value={offerComputed.monthlyDebtService} />
                  <ReadOnlyMoney value={individualComputed.monthlyDebtService} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Womit möchten Sie weiter rechnen?</SectionLabel>
              <PillOptions
                size="md"
                options={variantOptions}
                value={selectedVariant}
                onChange={(value) => setSelectedVariant(value as FinancingVariant)}
              />
              <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                <Icons.Info className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                <p>
                  Die gewählte Spalte wird in den Folgeschritten für Gesamtkosten, Eigenkapital, Darlehen,
                  Zins und Kapitaldienst verwendet.
                </p>
              </div>
            </div>
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
