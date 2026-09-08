"use client";

import { LoadingScreen, ReadOnlyField, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import {
  computeAcquisitionCosts,
  formatDecimalInput,
  parseDecimalInput,
  resolveStateFromPostalCode,
} from '@/lib/detailCheck/acquisitionCosts';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type FormState = {
  purchasePrice: string;
  parkingPurchasePrice: string;
  brokerPercent: string;
  livingAreaM2: string;
};

type ApiPayload = {
  state: string | null;
  postalCode: string | null;
  purchasePrice: number;
  parkingPurchasePrice: number;
  brokerPercent: number;
  notaryPercent: number;
  landRegistryPercent: number;
  propertyTransferTaxPercent: number | null;
  livingAreaM2: number | null;
  /** From Objektdaten. Null when that step has not been filled in yet. */
  parkingSpaces: number | null;
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function decimalString(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return formatDecimalInput(String(value));
}

function DecimalField({
  label,
  value,
  unit,
  onChange,
  error,
  disabled,
  helperText,
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <TextField
      label={label}
      inputMode="decimal"
      value={value}
      suffix={unit}
      error={error}
      disabled={disabled}
      helperText={helperText}
      onBlur={() => onChange(formatDecimalInput(value))}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function AcquisitionCostsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [form, setForm] = useState<FormState>({
    purchasePrice: '0',
    parkingPurchasePrice: '0',
    brokerPercent: '3,57',
    livingAreaM2: '',
  });
  const [apiData, setApiData] = useState<ApiPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/acquisition-costs${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as ApiPayload;
        if (cancelled) return;
        setApiData(data);
        setForm({
          purchasePrice: decimalString(data.purchasePrice),
          parkingPurchasePrice: decimalString(data.parkingPurchasePrice),
          brokerPercent: decimalString(data.brokerPercent),
          livingAreaM2: decimalString(data.livingAreaM2),
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Kaufkosten konnten nicht geladen werden.');
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

  // Explicitly 0 spaces recorded in Objektdaten → there is nothing to price,
  // so the field is locked. A null value means Objektdaten has not been filled
  // in yet; that stays editable rather than silently blocking input.
  const hasNoParkingSpaces = apiData?.parkingSpaces === 0;

  // Keep the stored amount consistent with the lock, otherwise a price entered
  // before the parking count was set back to 0 would stay in the form, remain
  // invisible to the user behind a disabled field, and still be saved into the
  // acquisition-cost total.
  useEffect(() => {
    if (!hasNoParkingSpaces) return;
    setForm((prev) => (parseDecimalInput(prev.parkingPurchasePrice) === 0
      ? prev
      : { ...prev, parkingPurchasePrice: '0' }));
  }, [hasNoParkingSpaces]);

  const values = useMemo(() => ({
    purchasePrice: parseDecimalInput(form.purchasePrice),
    parkingPurchasePrice: parseDecimalInput(form.parkingPurchasePrice),
    brokerPercent: parseDecimalInput(form.brokerPercent),
    livingAreaM2: form.livingAreaM2.trim() ? parseDecimalInput(form.livingAreaM2) : null,
  }), [form]);

  const state = apiData?.state ?? resolveStateFromPostalCode(apiData?.postalCode);
  const notaryPercent = apiData?.notaryPercent ?? 1.5;
  const landRegistryPercent = apiData?.landRegistryPercent ?? 0.5;
  const propertyTransferTaxPercent = apiData?.propertyTransferTaxPercent ?? null;

  const computed = useMemo(() => computeAcquisitionCosts({
    purchasePrice: values.purchasePrice,
    parkingPurchasePrice: values.parkingPurchasePrice,
    brokerPercent: values.brokerPercent,
    livingAreaM2: values.livingAreaM2,
    postalCode: apiData?.postalCode,
    notaryPercent,
    landRegistryPercent,
    propertyTransferTaxPercent,
  }), [
    values,
    apiData?.postalCode,
    notaryPercent,
    landRegistryPercent,
    propertyTransferTaxPercent,
  ]);

  const errors = {
    purchasePrice:
      values.purchasePrice < 0 || values.purchasePrice > 1_000_000_000
        ? 'Bitte einen Betrag zwischen 0 und 1.000.000.000 eingeben.'
        : '',
    parkingPurchasePrice:
      values.parkingPurchasePrice < 0 || values.parkingPurchasePrice > 1_000_000_000
        ? 'Bitte einen Betrag zwischen 0 und 1.000.000.000 eingeben.'
        : '',
    brokerPercent:
      values.brokerPercent < 0 || values.brokerPercent > 20
        ? 'Bitte einen Prozentsatz zwischen 0 und 20 eingeben.'
        : '',
  };

  const isValid = !errors.purchasePrice && !errors.parkingPurchasePrice && !errors.brokerPercent;

  const formatCurrency = (value: number | null | undefined) =>
    value == null ? '-' : currencyFormatter.format(value);
  const formatPercent = (value: number | null | undefined) =>
    value == null ? '-' : percentFormatter.format(value);

  const persist = async (): Promise<boolean> => {
    if (!isValid || isSaving) return false;

    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/acquisition-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          purchasePrice: values.purchasePrice,
          parkingPurchasePrice: values.parkingPurchasePrice,
          brokerPercent: values.brokerPercent,
          livingAreaM2: values.livingAreaM2,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kaufkosten konnten nicht gespeichert werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndNext = async () => {
    if (await persist()) router.push(`/property-valuation/detail-check/leasing-or-rentals${suffix}`);
  };

  const handleBack = async () => {
    if (await persist()) router.push(`/property-valuation/detail-check/property-data${suffix}`);
  };

  return (
    <PropertyValuationLayout currentStep={1} title="Kaufkosten" beforeStepChange={persist} showFieldLegend>
      <div className="pb-24">

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingScreen message="Kaufkosten werden geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SectionLabel>Kaufpreise</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DecimalField
                  label="Kaufpreis"
                  value={form.purchasePrice}
                  unit="€"
                  error={errors.purchasePrice}
                  onChange={(purchasePrice) => setForm((prev) => ({ ...prev, purchasePrice }))}
                />
                <ReadOnlyField
                  label="Kaufpreis pro m²"
                  value={formatCurrency(computed.purchasePricePerM2)}
                  suffix="€"
                  helperText={computed.purchasePricePerM2 == null ? 'Wohnfläche fehlt noch.' : 'Aus Kaufpreis und Wohnfläche berechnet.'}
                />
                <DecimalField
                  label="Kaufpreis Stellplatz"
                  value={form.parkingPurchasePrice}
                  unit="€"
                  error={errors.parkingPurchasePrice}
                  disabled={hasNoParkingSpaces}
                  helperText={hasNoParkingSpaces ? 'In den Objektdaten sind keine Stellplätze erfasst.' : undefined}
                  onChange={(parkingPurchasePrice) => setForm((prev) => ({ ...prev, parkingPurchasePrice }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Kaufnebenkosten</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="flex flex-col gap-3">
                  <div>
                    <DecimalField
                      label="Makler"
                      value={form.brokerPercent}
                      unit="%"
                      error={errors.brokerPercent}
                      onChange={(brokerPercent) => setForm((prev) => ({ ...prev, brokerPercent }))}
                    />
                    {/* Reserves the same height as Grunderwerbsteuer's helper line below,
                        so every "*-kosten" row starts at the same y regardless of column. */}
                    <div className="mt-1.5 h-5" aria-hidden="true" />
                  </div>
                  <ReadOnlyField label="Maklerkosten" value={formatCurrency(computed.brokerAmount)} suffix="€" />
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <ReadOnlyField label="Notar" value={formatPercent(notaryPercent)} suffix="%" />
                    <div className="mt-1.5 h-5" aria-hidden="true" />
                  </div>
                  <ReadOnlyField label="Notarkosten" value={formatCurrency(computed.notaryAmount)} suffix="€" />
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <ReadOnlyField label="Grundbuchamt" value={formatPercent(landRegistryPercent)} suffix="%" />
                    <div className="mt-1.5 h-5" aria-hidden="true" />
                  </div>
                  <ReadOnlyField label="Grundbuchamtkosten" value={formatCurrency(computed.landRegistryAmount)} suffix="€" />
                </div>

                <div className="flex flex-col gap-3">
                  <ReadOnlyField
                    label="Grunderwerbsteuer"
                    value={formatPercent(propertyTransferTaxPercent)}
                    suffix="%"
                    helperText={propertyTransferTaxPercent == null ? 'PLZ prüfen' : `${state ?? ''}${apiData?.postalCode ? ` aus PLZ ${apiData.postalCode}` : ''}`}
                  />
                  <ReadOnlyField
                    label="Grunderwerbsteuerkosten"
                    value={formatCurrency(computed.propertyTransferTaxAmount)}
                    suffix="€"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Gesamtkosten</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gesamtnebenkosten</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatCurrency(computed.totalAdditionalCosts)} <span className="text-base font-normal text-muted-foreground">€</span>
                  </p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Gesamtkaufpreis</p>
                  <p className="mt-1 text-2xl font-semibold text-primary">
                    {formatCurrency(computed.totalCosts)} <span className="text-base font-normal text-primary/70">€</span>
                  </p>
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
        onGhost={() => void handleBack()}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={!isValid || isSaving || isLoading}
        onPrimary={handleSaveAndNext}
      />
    </PropertyValuationLayout>
  );
}

export default function AcquisitionCostsPage() {
  return (
    <Suspense fallback={null}>
      <AcquisitionCostsContent />
    </Suspense>
  );
}
