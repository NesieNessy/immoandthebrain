"use client";

import { Button, Dropdown, LoadingScreen, PillOptions, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
import { PROPERTY_CATEGORY_CREATE_OPTIONS } from '@/components/features/PropertyDisplay';
import { PortalImportSection } from '@/components/features/PortalImportSection';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import { parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type FormState = {
  propertyCategory: string;
  tenancyType: string;
  sourceUrl: string;
  streetHouseNumber: string;
  postalCode: string;
  city: string;
  yearOfConstruction: string;
  livingAreaM2: string;
  parkingSpaces: string;
  energyEfficiency: string;
};

type PropertyDataResponse = FormState & {
  workflowId: string;
  quickCheckId: number | null;
  hasDetailCheckData: boolean;
  livingAreaM2: number | string;
  parkingSpaces: number | string;
  yearOfConstruction: number | string;
};

type PostalCodeLookupResponse = {
  postalCode: string;
  cities: string[];
  federalState: { key: string; name: string } | null;
};

type PostalLookupStatus = 'idle' | 'loading' | 'resolved' | 'empty' | 'error';

const EMPTY_FORM: FormState = {
  propertyCategory: 'EIGENTUMSWOHNUNG',
  tenancyType: 'STANDARD',
  sourceUrl: '',
  streetHouseNumber: '',
  postalCode: '',
  city: '',
  yearOfConstruction: '',
  livingAreaM2: '',
  parkingSpaces: '0',
  energyEfficiency: '',
};

const tenancyTypeOptions = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'INDEXMIETE', label: 'Indexmiete', disabled: true, title: 'Ausbaustufe' },
  { value: 'NIESSBRAUCH', label: 'Nießbrauch', disabled: true, title: 'Ausbaustufe' },
  { value: 'ERBPACHT', label: 'Erbpacht', disabled: true, title: 'Ausbaustufe' },
  { value: 'SONDERVERMIETUNG', label: 'Sondervermietung', disabled: true, title: 'Ausbaustufe' },
  { value: 'GEWERBE', label: 'Gewerbe', disabled: true, title: 'Ausbaustufe' },
  { value: 'ALTENHEIM', label: 'Altenheim', disabled: true, title: 'Ausbaustufe' },
  { value: 'ZWANGSVERSTEIGERUNG', label: 'Zwangsversteigerung', disabled: true, title: 'Ausbaustufe' },
];

const parkingOptions = Array.from({ length: 11 }, (_, value) => ({
  value: String(value),
  label: String(value),
}));

const energyOptions = [
  { value: '', label: 'Bitte wählen...' },
  ...['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((value) => ({ value, label: value })),
];

function valueString(value: number | string | null | undefined): string {
  if (value == null) return '';
  return String(value).replace('.', ',');
}

function PropertyDataContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId
    ? `?quickCheckId=${encodeURIComponent(quickCheckId)}`
    : workflowId
      ? `?workflowId=${encodeURIComponent(workflowId)}`
      : '';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasDetailCheckData, setHasDetailCheckData] = useState(false);
  const [postalCodeWasEdited, setPostalCodeWasEdited] = useState(false);
  const [postalLookupStatus, setPostalLookupStatus] = useState<PostalLookupStatus>('idle');
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setTopError(null);
      try {
        const res = await authFetch(`/api/detail-check/property-data${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as PropertyDataResponse;
        if (cancelled) return;
        setHasDetailCheckData(data.hasDetailCheckData);
        setPostalCodeWasEdited(false);
        setForm({
          propertyCategory: data.propertyCategory || 'EIGENTUMSWOHNUNG',
          tenancyType: data.tenancyType || 'STANDARD',
          sourceUrl: data.sourceUrl || '',
          streetHouseNumber: data.streetHouseNumber || '',
          postalCode: data.postalCode || '',
          city: data.city || '',
          yearOfConstruction: valueString(data.yearOfConstruction),
          livingAreaM2: valueString(data.livingAreaM2),
          parkingSpaces: valueString(data.parkingSpaces || 0),
          energyEfficiency: data.energyEfficiency || '',
        });
      } catch (error) {
        if (!cancelled) {
          setTopError(error instanceof Error ? error.message : 'Objektdaten konnten nicht geladen werden.');
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

  useEffect(() => {
    const postalCode = form.postalCode;
    if (isLoading || !/^\d{5}$/.test(postalCode)) {
      setPostalLookupStatus('idle');
      setCityOptions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPostalLookupStatus('loading');
      try {
        const response = await authFetch(
          `/api/address/postal-code?postalCode=${encodeURIComponent(postalCode)}`,
          { cache: 'force-cache', signal: controller.signal },
        );
        if (!response.ok) throw new Error(await response.text());

        const payload = await response.json() as PostalCodeLookupResponse;
        if (controller.signal.aborted || payload.postalCode !== postalCode) return;

        setCityOptions(payload.cities);
        setPostalLookupStatus(payload.cities.length > 0 ? 'resolved' : 'empty');
        setForm((previous) => {
          if (previous.postalCode !== postalCode) return previous;
          if (payload.cities.length === 1 && (postalCodeWasEdited || !previous.city.trim())) {
            return { ...previous, city: payload.cities[0] };
          }
          if (
            payload.cities.length > 1
            && postalCodeWasEdited
            && !payload.cities.includes(previous.city)
          ) {
            return { ...previous, city: '' };
          }
          return previous;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Postal-code lookup failed:', error);
        setCityOptions([]);
        setPostalLookupStatus('error');
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.postalCode, isLoading, postalCodeWasEdited]);

  const currentYear = new Date().getFullYear();
  const liveErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const year = Number(form.yearOfConstruction);
    const livingArea = parseDecimalInput(form.livingAreaM2);

    if (form.streetHouseNumber.length > 100) errors.streetHouseNumber = 'Maximal 100 Zeichen.';
    if (form.postalCode && !/^\d{4,5}$/.test(form.postalCode)) errors.postalCode = 'Bitte 4 bis 5 Ziffern eingeben.';
    if (form.city && form.city.length > 100) errors.city = 'Maximal 100 Zeichen.';
    if (form.yearOfConstruction && (!Number.isInteger(year) || year < 1000 || year > currentYear)) {
      errors.yearOfConstruction = `Baujahr muss zwischen 1000 und ${currentYear} liegen.`;
    }
    if (form.livingAreaM2 && (livingArea <= 0 || livingArea > 10000)) {
      errors.livingAreaM2 = 'Wohnfläche muss größer als 0 und maximal 10.000 sein.';
    }

    return errors;
  }, [form, currentYear]);

  const displayErrors = { ...liveErrors, ...fieldErrors };

  // Mirrors validateBeforeSave's checks, without setting fieldErrors — used
  // to keep "Weiter" disabled until every mandatory field is actually filled.
  const isValid = useMemo(() => {
    if (!form.propertyCategory) return false;
    if (!form.tenancyType) return false;
    if (form.sourceUrl.trim()) {
      try {
        new URL(form.sourceUrl);
      } catch {
        return false;
      }
    }
    if (!form.city.trim()) return false;
    const year = Number(form.yearOfConstruction);
    if (!Number.isInteger(year) || year < 1000 || year > currentYear) return false;
    const livingArea = parseDecimalInput(form.livingAreaM2);
    if (livingArea <= 0 || livingArea > 10000) return false;
    return true;
  }, [form, currentYear]);

  const updateForm = (field: keyof FormState, value: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

    if (field === 'postalCode') {
      setPostalCodeWasEdited(true);
      setPostalLookupStatus('idle');
      setCityOptions([]);
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const cityHelperText = postalLookupStatus === 'loading'
    ? 'Ort wird automatisch ermittelt...'
    : postalLookupStatus === 'resolved' && cityOptions.length === 1
      ? 'Automatisch aus der Postleitzahl ermittelt. Der Ort bleibt änderbar.'
      : postalLookupStatus === 'resolved'
        ? 'Mehrere Orte gefunden. Bitte einen Vorschlag auswählen.'
        : postalLookupStatus === 'empty'
          ? 'Zu dieser Postleitzahl wurde kein Ort gefunden. Bitte manuell eingeben.'
          : postalLookupStatus === 'error'
            ? 'Automatische Ortssuche derzeit nicht verfügbar. Bitte manuell eingeben.'
            : undefined;

  const validateBeforeSave = () => {
    const errors: Record<string, string> = { ...liveErrors };
    const year = Number(form.yearOfConstruction);
    const livingArea = parseDecimalInput(form.livingAreaM2);

    if (!form.propertyCategory) errors.propertyCategory = 'Bitte wählen Sie eine Objektkategorie.';
    if (!form.tenancyType) errors.tenancyType = 'Bitte wählen Sie eine Miet-/Nutzungsart.';
    if (form.sourceUrl.trim()) {
      try {
        new URL(form.sourceUrl);
      } catch {
        errors.sourceUrl = 'Bitte eine gültige URL eingeben.';
      }
    }
    if (!form.city.trim()) errors.city = 'Ort ist ein Pflichtfeld.';
    if (!Number.isInteger(year) || year < 1000 || year > currentYear) {
      errors.yearOfConstruction = `Baujahr muss zwischen 1000 und ${currentYear} liegen.`;
    }
    if (livingArea <= 0 || livingArea > 10000) {
      errors.livingAreaM2 = 'Wohnfläche muss größer als 0 sein.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const persist = async (): Promise<boolean> => {
    if (isSaving || !validateBeforeSave()) return false;

    setIsSaving(true);
    setTopError(null);
    try {
      const res = await authFetch('/api/detail-check/property-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          propertyCategory: form.propertyCategory,
          dataEntrySource: form.sourceUrl.trim() ? 'PORTAL_IMPORT' : 'MANUELL',
          tenancyType: form.tenancyType,
          sourceUrl: form.sourceUrl,
          streetHouseNumber: form.streetHouseNumber,
          postalCode: form.postalCode,
          city: form.city,
          yearOfConstruction: Number(form.yearOfConstruction),
          livingAreaM2: parseDecimalInput(form.livingAreaM2),
          parkingSpaces: Number(form.parkingSpaces || 0),
          energyEfficiency: form.energyEfficiency,
        }),
      });

      if (!res.ok) {
        const responseText = await res.text();
        let payload: { fieldErrors?: Record<string, string>; error?: string } | null = null;
        try {
          payload = responseText ? JSON.parse(responseText) : null;
        } catch {
          payload = null;
        }
        if (payload?.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
          setTopError('Bitte prüfen Sie die markierten Felder.');
          return false;
        }
        throw new Error(payload?.error ?? responseText);
      }

      const payload = await res.json() as { workflowId: string };
      if (!quickCheckId && !workflowId) {
        window.history.replaceState(null, '', `${window.location.pathname}?workflowId=${encodeURIComponent(payload.workflowId)}`);
      }
      return true;
    } catch (error) {
      setTopError(error instanceof Error ? error.message : 'Objektdaten konnten nicht gespeichert werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    if (!(await persist())) return;
    const currentWorkflowId = new URLSearchParams(window.location.search).get('workflowId');
    const nextSuffix = quickCheckId
      ? suffix
      : currentWorkflowId
        ? `?workflowId=${encodeURIComponent(currentWorkflowId)}`
        : suffix;
    router.push(`/property-valuation/detail-check/acquisition-costs${nextSuffix}`);
  };

  const handleBack = () => {
    router.push(quickCheckId && !hasDetailCheckData
      ? '/property-valuation/quick-check'
      : '/property-valuation/detail-check');
  };

  return (
    <PropertyValuationLayout currentStep={0} title="Objektdaten" beforeStepChange={persist}>
      <div className="pb-24">
        {topError && (
          <div aria-live="assertive" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {topError}
          </div>
        )}

        {isLoading ? (
          <LoadingScreen message="Objektdaten werden geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <PortalImportSection
                portalUrl={form.sourceUrl}
                onPortalUrlChange={(value) => updateForm('sourceUrl', value)}
                urlError={displayErrors.sourceUrl}
                extraTrigger={
                  <Button
                    label={BUTTON_DETAILS.ScanExpose.label}
                    icon={<BUTTON_DETAILS.ScanExpose.icon />}
                    variant="outline"
                    disabled
                    title="Noch nicht verfügbar"
                    className="w-full"
                  />
                }
              />
              {form.sourceUrl.trim() && (
                <p className="text-sm text-muted-foreground truncate -mt-1">Importiert von: {form.sourceUrl}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Objektkategorie</SectionLabel>
              <PillOptions
                options={PROPERTY_CATEGORY_CREATE_OPTIONS}
                value={form.propertyCategory}
                onChange={(value) => updateForm('propertyCategory', value)}
              />
              {displayErrors.propertyCategory && (
                <p role="alert" className="text-sm text-destructive">{displayErrors.propertyCategory}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Miet-/Nutzungsart</SectionLabel>
              <PillOptions
                options={tenancyTypeOptions}
                value={form.tenancyType}
                onChange={(value) => updateForm('tenancyType', value)}
              />
              {displayErrors.tenancyType && (
                <p role="alert" className="text-sm text-destructive">{displayErrors.tenancyType}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Adresse</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.8fr_1fr] gap-3">
                <TextField
                  label="Straße + Hausnummer"
                  optional
                  placeholder="Straße"
                  autoComplete="street-address"
                  value={form.streetHouseNumber}
                  onChange={(event) => updateForm('streetHouseNumber', event.target.value)}
                  error={displayErrors.streetHouseNumber}
                />
                <TextField
                  label="Postleitzahl"
                  optional
                  placeholder="Postleitzahl"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={form.postalCode}
                  onChange={(event) => updateForm('postalCode', event.target.value.replace(/\D/g, '').slice(0, 5))}
                  error={displayErrors.postalCode}
                />
                <TextField
                  label="Ort"
                  placeholder="Ort"
                  autoComplete="address-level2"
                  list={cityOptions.length > 1 ? 'detail-check-city-options' : undefined}
                  aria-busy={postalLookupStatus === 'loading'}
                  value={form.city}
                  onChange={(event) => updateForm('city', event.target.value)}
                  error={displayErrors.city}
                  helperText={cityHelperText}
                />
                {cityOptions.length > 1 && (
                  <datalist id="detail-check-city-options">
                    {cityOptions.map((city) => <option key={city} value={city} />)}
                  </datalist>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Objektdetails</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TextField
                  label="Wohnfläche"
                  placeholder="100"
                  inputMode="decimal"
                  suffix="m²"
                  value={form.livingAreaM2}
                  onChange={(event) => updateForm('livingAreaM2', event.target.value)}
                  error={displayErrors.livingAreaM2}
                />
                <TextField
                  label="Baujahr"
                  placeholder="1980"
                  inputMode="numeric"
                  value={form.yearOfConstruction}
                  onChange={(event) => updateForm('yearOfConstruction', event.target.value.replace(/\D/g, '').slice(0, 4))}
                  error={displayErrors.yearOfConstruction}
                />
                <Dropdown
                  label="Anzahl Stellplätze"
                  options={parkingOptions}
                  value={form.parkingSpaces}
                  onChange={(event) => updateForm('parkingSpaces', event.target.value)}
                  error={displayErrors.parkingSpaces}
                />
                <Dropdown
                  label="Energieeffizienz"
                  optional
                  options={energyOptions}
                  value={form.energyEfficiency}
                  onChange={(event) => updateForm('energyEfficiency', event.target.value)}
                  error={displayErrors.energyEfficiency}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={handleBack}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving || !isValid}
        onPrimary={handleNext}
      />
    </PropertyValuationLayout>
  );
}

export default function PropertyDataPage() {
  return (
    <Suspense fallback={null}>
      <PropertyDataContent />
    </Suspense>
  );
}
