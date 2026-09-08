"use client";

import { Button, LoadingScreen, Modal, MonthField, StickyActionBar, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authFetch } from '@/lib/api/authFetch';
import { formatDecimalInput, parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import {
  applyServiceChargeSuggestion,
  currentMonthDate,
  monthFromDate,
  normalizeMonthInput,
  serviceChargesMismatch,
  type RentalField,
} from '@/lib/detailCheck/rental';
import { uploadDocument } from '@/lib/supabase/document.supabase';
import { format } from 'date-fns';
import { Info, Upload } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type RentalForm = {
  valuationMonth: string;
  isRented: boolean;
  coldRent: string;
  parkingRent: string;
  serviceChargesAllocable: string;
  serviceChargesNonAllocable: string;
  serviceChargesTotal: string;
};

type RentalResponse = {
  valuationDate: string;
  isRented: boolean;
  coldRent: number;
  parkingRent: number;
  serviceChargesAllocable: number;
  serviceChargesNonAllocable: number;
  serviceChargesTotal: number;
  parkingSpaces: number;
};

type ServiceChargeMode = 'TOTAL' | 'SPLIT';
type AmountPeriod = 'MONTH' | 'YEAR';

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function valueString(value: number | string | null | undefined): string {
  if (value == null) return '';
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return value === 0 ? '' : String(value);
  return formatDecimalInput(String(value));
}

function MoneyField({
  label,
  value,
  onChange,
  error,
  disabled,
  readOnly,
  suffix = '€',
  helperText,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  suffix?: string;
  helperText?: string;
  optional?: boolean;
}) {
  return (
    <TextField
      label={label}
      optional={optional}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onChange(formatDecimalInput(value))}
      inputMode="decimal"
      suffix={suffix}
      error={error}
      helperText={helperText}
      disabled={disabled}
      readOnly={readOnly}
      className={readOnly ? 'bg-muted' : undefined}
    />
  );
}

function RentalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useRequireAuth();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [form, setForm] = useState<RentalForm>({
    valuationMonth: monthFromDate(currentMonthDate()),
    isRented: true,
    coldRent: '',
    parkingRent: '',
    serviceChargesAllocable: '',
    serviceChargesNonAllocable: '',
    serviceChargesTotal: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [serviceChargeFileName, setServiceChargeFileName] = useState<string | null>(null);
  const [isUploadingServiceCharge, setIsUploadingServiceCharge] = useState(false);
  const [serviceChargeUploadError, setServiceChargeUploadError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [parkingSpaces, setParkingSpaces] = useState(0);
  const [serviceChargeMode, setServiceChargeMode] = useState<ServiceChargeMode>('SPLIT');
  const [amountPeriod, setAmountPeriod] = useState<AmountPeriod>('MONTH');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setTopError(null);
      try {
        const res = await authFetch(`/api/detail-check/rental${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as RentalResponse;
        if (cancelled) return;
        const allocable = valueString(data.serviceChargesAllocable);
        const nonAllocable = valueString(data.serviceChargesNonAllocable);
        const total = applyServiceChargeSuggestion(
          { allocable, nonAllocable, total: valueString(data.serviceChargesTotal) },
          'allocable',
          parseDecimalInput,
        ).total;
        setForm({
          valuationMonth: monthFromDate(data.valuationDate),
          isRented: true,
          coldRent: valueString(data.coldRent),
          parkingRent: valueString(data.parkingRent),
          serviceChargesAllocable: allocable,
          serviceChargesNonAllocable: nonAllocable,
          serviceChargesTotal: total,
        });
        setParkingSpaces(data.parkingSpaces);
      } catch (error) {
        if (!cancelled) {
          setTopError(error instanceof Error ? error.message : 'Vermietungsdaten konnten nicht geladen werden.');
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

  const periodDivisor = amountPeriod === 'YEAR' ? 12 : 1;
  const values = useMemo(() => ({
    coldRent: parseDecimalInput(form.coldRent) / periodDivisor,
    parkingRent: parseDecimalInput(form.parkingRent) / periodDivisor,
    serviceChargesAllocable: parseDecimalInput(form.serviceChargesAllocable) / periodDivisor,
    serviceChargesNonAllocable: parseDecimalInput(form.serviceChargesNonAllocable) / periodDivisor,
    serviceChargesTotal: parseDecimalInput(form.serviceChargesTotal) / periodDivisor,
  }), [form, periodDivisor]);

  const amountErrors = {
    coldRent: values.coldRent < 0 || values.coldRent > 1_000_000_000 ? 'Bitte einen Betrag >= 0 eingeben.' : '',
    parkingRent: values.parkingRent < 0 || values.parkingRent > 1_000_000_000 ? 'Bitte einen Betrag >= 0 eingeben.' : '',
    serviceChargesAllocable: values.serviceChargesAllocable < 0 || values.serviceChargesAllocable > 1_000_000_000 ? 'Bitte einen Betrag >= 0 eingeben.' : '',
    serviceChargesNonAllocable: values.serviceChargesNonAllocable < 0 || values.serviceChargesNonAllocable > 1_000_000_000 ? 'Bitte einen Betrag >= 0 eingeben.' : '',
    serviceChargesTotal: values.serviceChargesTotal < 0 || values.serviceChargesTotal > 1_000_000_000 ? 'Bitte einen Betrag >= 0 eingeben.' : '',
  };

  const hasAmountError = Object.values(amountErrors).some(Boolean);
  const nkMismatch = serviceChargesMismatch(
    values.serviceChargesAllocable,
    values.serviceChargesNonAllocable,
    values.serviceChargesTotal,
  );

  const updateMoney = (field: keyof RentalForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateServiceCharge = (field: RentalField, value: string) => {
    setForm((prev) => {
      if (field === 'total') {
        const total = parseDecimalInput(value);
        return {
          ...prev,
          serviceChargesTotal: value,
          serviceChargesAllocable: value ? String(Math.round(total * 60) / 100).replace('.', ',') : '',
          serviceChargesNonAllocable: value ? String(Math.round(total * 40) / 100).replace('.', ',') : '',
        };
      }
      const mapped = {
        allocable: prev.serviceChargesAllocable,
        nonAllocable: prev.serviceChargesNonAllocable,
        total: prev.serviceChargesTotal,
        [field]: value,
      };
      const next = applyServiceChargeSuggestion(mapped, field, parseDecimalInput);
      return {
        ...prev,
        serviceChargesAllocable: next.allocable,
        serviceChargesNonAllocable: next.nonAllocable,
        serviceChargesTotal: next.total,
      };
    });
  };

  const changeAmountPeriod = (nextPeriod: AmountPeriod) => {
    if (nextPeriod === amountPeriod) return;
    const factor = nextPeriod === 'YEAR' ? 12 : 1 / 12;
    const convert = (value: string) => value
      ? String(Math.round(parseDecimalInput(value) * factor * 100) / 100).replace('.', ',')
      : '';
    setForm((prev) => ({
      ...prev,
      coldRent: convert(prev.coldRent),
      parkingRent: convert(prev.parkingRent),
      serviceChargesAllocable: convert(prev.serviceChargesAllocable),
      serviceChargesNonAllocable: convert(prev.serviceChargesNonAllocable),
      serviceChargesTotal: convert(prev.serviceChargesTotal),
    }));
    setAmountPeriod(nextPeriod);
  };

  const changeServiceChargeMode = (nextMode: ServiceChargeMode) => {
    if (nextMode === serviceChargeMode) return;
    setServiceChargeMode(nextMode);
    setForm((prev) => {
      const total = parseDecimalInput(prev.serviceChargesTotal)
        || parseDecimalInput(prev.serviceChargesAllocable) + parseDecimalInput(prev.serviceChargesNonAllocable);
      if (nextMode === 'TOTAL') {
        return {
          ...prev,
          serviceChargesTotal: total ? String(total).replace('.', ',') : '',
          serviceChargesAllocable: total ? String(Math.round(total * 60) / 100).replace('.', ',') : '',
          serviceChargesNonAllocable: total ? String(Math.round(total * 40) / 100).replace('.', ',') : '',
        };
      }
      return { ...prev, serviceChargesTotal: total ? String(total).replace('.', ',') : '' };
    });
  };

  const persist = async (ignoreMismatch = false): Promise<boolean> => {
    if (hasAmountError || isSaving) return false;
    if (!ignoreMismatch && nkMismatch) {
      setWarningOpen(true);
      return false;
    }

    setIsSaving(true);
    setTopError(null);
    try {
      const res = await authFetch('/api/detail-check/rental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          valuationDate: normalizeMonthInput(form.valuationMonth),
          isRented: form.isRented,
          source: 'MANUELL',
          coldRent: values.coldRent,
          parkingRent: values.parkingRent,
          serviceChargesAllocable: values.serviceChargesAllocable,
          serviceChargesNonAllocable: values.serviceChargesNonAllocable,
          serviceChargesTotal: values.serviceChargesTotal,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (error) {
      setTopError(error instanceof Error ? error.message : 'Vermietungsdaten konnten nicht gespeichert werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndNavigate = async (path: string, ignoreMismatch = false) => {
    if (await persist(ignoreMismatch)) router.push(`${path}${suffix}`);
  };

  const handleUploadServiceCharge = async (file: File) => {
    if (!user || !quickCheckId) return;
    setIsUploadingServiceCharge(true);
    setServiceChargeUploadError(null);
    try {
      const { document: uploaded, error } = await uploadDocument(user.id, file, {
        userId: user.id,
        category: 'Detailbewertung',
        name: 'Nebenkostenabrechnung',
        propertyId: null,
        quickCheckId: Number(quickCheckId),
        documentDate: format(new Date(), 'yyyy-MM-dd'),
      });
      if (uploaded) {
        setServiceChargeFileName(uploaded.fileName);
      } else {
        setServiceChargeUploadError(error ?? 'Datei konnte nicht hochgeladen werden.');
      }
    } finally {
      setIsUploadingServiceCharge(false);
    }
  };

  return (
    <PropertyValuationLayout currentStep={2} title="Vermietung" beforeStepChange={() => persist(false)}>
      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Nebenkosten"
        subtitle="Umlagefähige und nicht umlagefähige Positionen"
        icon={<Info />}
        maxWidth="max-w-3xl"
      >
        <div className="max-h-[65vh] overflow-y-auto text-sm leading-6 text-foreground">
          <h3 className="font-semibold">Umlagefähige Nebenkosten nach §2 BetrKV</h3>
          <p className="text-muted-foreground">
            Typische Positionen sind Grundsteuer, Wasserversorgung, Entwässerung, Heizung, Warmwasser,
            Aufzug, Straßenreinigung, Müllabfuhr, Gebäudeversicherung, Hausmeisteranteile für Reinigung
            und Pflege, Gebäudereinigung, Gartenpflege, Allgemeinstrom, Schornsteinreinigung, Wartung von
            Gemeinschaftsanlagen, Kabel/Breitband sowie ausdrücklich vereinbarte sonstige Betriebskosten.
          </p>
          <h3 className="mt-4 font-semibold">Nicht umlagefähige Nebenkosten</h3>
          <p className="text-muted-foreground">
            Dazu zählen Instandhaltung und Reparaturen, Verwaltungskosten, Rechts- und Gerichtskosten,
            Abschreibungen, Finanzierungskosten, nicht gebäudebezogene Versicherungen, Hausmeisteranteile
            für Verwaltung oder Reparatur sowie Kosten für leerstehende Wohnungen.
          </p>
          <p className="mt-4 text-muted-foreground">Die Auflistung ist beispielhaft und nicht abschließend.</p>
        </div>
      </Modal>

      <Modal
        open={warningOpen}
        onClose={() => setWarningOpen(false)}
        title="Nebenkosten prüfen"
        subtitle="Die eingetragenen Werte wirken nicht plausibel."
        footer={
          <>
            <Button
              label="Zurück & prüfen"
              variant="outline"
              onClick={() => setWarningOpen(false)}
            />
            <Button
              label="Weiter trotz Abweichung"
              onClick={() => {
                setWarningOpen(false);
                void saveAndNavigate('/property-valuation/detail-check/financing', true);
              }}
            />
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Ihre eingetragenen Werte unter Nebenkosten sind nicht plausibel. Möchten Sie dennoch damit weiter bewerten?
        </p>
      </Modal>

      <div className="pb-24">

        {topError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {topError}
          </div>
        )}

        {isLoading ? (
          <LoadingScreen message="Vermietungsdaten werden geladen…" fullScreen={false} />
        ) : (
          <div className="space-y-7">
            <section className="grid gap-4 md:grid-cols-[minmax(0,260px)_auto] md:items-start md:justify-start">
              <MonthField
                label="Mieteinnahmen Bewertungs-Stichtag"
                value={form.valuationMonth}
                helperText="* Erste Vermietung ab Kauf"
                onChange={(value) => setForm((prev) => ({ ...prev, valuationMonth: value }))}
              />
              <div className="inline-flex w-fit rounded-md border border-border bg-muted p-1 md:mt-7">
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${amountPeriod === 'MONTH' ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground'}`} onClick={() => changeAmountPeriod('MONTH')}>Monatlich</button>
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${amountPeriod === 'YEAR' ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground'}`} onClick={() => changeAmountPeriod('YEAR')}>Jährlich</button>
              </div>
            </section>

            <section>
              <div className="grid gap-4 md:grid-cols-2">
                  <MoneyField
                    label="Kaltmiete"
                    optional
                    value={form.coldRent}
                    error={amountErrors.coldRent}
                    onChange={(value) => updateMoney('coldRent', value)}
                    suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                  />
                  <MoneyField
                    label="Stellplatz"
                    optional
                    value={form.parkingRent}
                    error={amountErrors.parkingRent}
                    onChange={(value) => updateMoney('parkingRent', value)}
                    disabled={parkingSpaces === 0}
                    suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                    helperText={parkingSpaces === 0 ? 'In den Objektdaten sind keine Stellplätze erfasst.' : undefined}
                  />
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-medium text-foreground">Nebenkosten</h2>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  aria-label="Informationen zu Nebenkosten"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Info size={16} />
                </button>
              </div>

              <div className="mb-4 inline-flex rounded-md border border-border bg-muted p-1">
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${serviceChargeMode === 'TOTAL' ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground'}`} onClick={() => changeServiceChargeMode('TOTAL')}>NK gesamt</button>
                <button type="button" className={`rounded px-3 py-1.5 text-sm ${serviceChargeMode === 'SPLIT' ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground'}`} onClick={() => changeServiceChargeMode('SPLIT')}>NK-Aufteilung bekannt</button>
              </div>

              {nkMismatch && (
                <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  Ihre eingetragenen Werte unter Nebenkosten sind nicht plausibel. Sie können trotzdem weiter bewerten.
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                {serviceChargeMode === 'TOTAL' && (
                  <MoneyField
                    label="NK gesamt"
                    optional
                    value={form.serviceChargesTotal}
                    error={amountErrors.serviceChargesTotal}
                    onChange={(value) => updateServiceCharge('total', value)}
                    suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                    helperText="Umlagefähig und nicht umlagefähig werden automatisch im Verhältnis 60/40 aufgeteilt."
                  />
                )}
                <MoneyField
                  label="NK umlagefähig"
                  optional={serviceChargeMode !== 'TOTAL'}
                  value={form.serviceChargesAllocable}
                  error={amountErrors.serviceChargesAllocable}
                  onChange={(value) => updateServiceCharge('allocable', value)}
                  readOnly={serviceChargeMode === 'TOTAL'}
                  suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                />
                <MoneyField
                  label="NK nicht umlagefähig"
                  optional={serviceChargeMode !== 'TOTAL'}
                  value={form.serviceChargesNonAllocable}
                  error={amountErrors.serviceChargesNonAllocable}
                  onChange={(value) => updateServiceCharge('nonAllocable', value)}
                  readOnly={serviceChargeMode === 'TOTAL'}
                  suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                />
                {serviceChargeMode === 'SPLIT' && (
                  <MoneyField
                    label="NK gesamt"
                    value={form.serviceChargesTotal}
                    error={amountErrors.serviceChargesTotal}
                    onChange={(value) => updateServiceCharge('total', value)}
                    readOnly
                    suffix={amountPeriod === 'YEAR' ? '€/Jahr' : '€/Monat'}
                  />
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)] md:items-center">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Falls vorhanden, können Sie hier die letzte Nebenkostenabrechnung hochladen. Sie erscheint anschließend auch auf der Dokumente-Seite.
                </p>
                {serviceChargeFileName && (
                  <p className="mt-1 text-xs text-primary">Hochgeladen: {serviceChargeFileName}</p>
                )}
                {serviceChargeUploadError && (
                  <p className="mt-1 text-xs text-destructive">{serviceChargeUploadError}</p>
                )}
              </div>
              <div>
                <input
                  id="service-charge-upload"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  className="sr-only"
                  disabled={!quickCheckId || isUploadingServiceCharge}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void handleUploadServiceCharge(file);
                  }}
                />
                <label htmlFor="service-charge-upload">
                  <span
                    title={!quickCheckId ? 'Bitte zuerst speichern' : undefined}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary text-primary text-sm font-medium transition-colors ${
                      !quickCheckId || isUploadingServiceCharge
                        ? 'opacity-50 pointer-events-none cursor-not-allowed'
                        : 'cursor-pointer hover:bg-primary hover:text-primary-foreground'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </span>
                </label>
              </div>
            </section>

            <p className="text-xs text-muted-foreground">
              Aktuelle Nebenkosten-Summe: {currencyFormatter.format(values.serviceChargesAllocable + values.serviceChargesNonAllocable)} €
            </p>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => void saveAndNavigate('/property-valuation/detail-check/acquisition-costs')}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving || hasAmountError}
        onPrimary={() => void saveAndNavigate('/property-valuation/detail-check/financing')}
      />
    </PropertyValuationLayout>
  );
}

export default function LeasingOrTenancysPage() {
  return (
    <Suspense fallback={null}>
      <RentalContent />
    </Suspense>
  );
}
