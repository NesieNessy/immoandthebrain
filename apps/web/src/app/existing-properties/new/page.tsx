"use client";

import { BESTANDSOBJEKTE_BREADCRUMB_ROOT, PROPERTY_CATEGORY_CREATE_OPTIONS } from '@/components/features/PropertyDisplay';
import { CalendarField, Dropdown, Header, Icons, NumberField, PAGE_CONTAINER_CLASS, PillOptions, SectionLabel, StickyActionBar, TextField, UnsavedChangesModal, UploadButton, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { getLabel } from '@/constants/FieldLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createAcquisitionCosts } from '@/lib/supabase/acquisition_costs.supabase';
import { createParkingSpace } from '@/lib/supabase/parking_space.supabase';
import { createProperty } from '@/lib/supabase/property.supabase';
import { createPropertyAcquisition } from '@/lib/supabase/property_acquisition.supabase';
import { base64ToDataUri } from '@/lib/utils';
import { EnergyEfficient } from '@immonext/types';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';

/** Strips the "data:image/...;base64," prefix — Property.imageUrl stores
 *  raw base64 only; base64ToDataUri() re-adds the right prefix for display. */
function readFileAsRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const ENERGY_OPTIONS = [
  { value: '', label: 'Bitte wählen...' },
  ...Object.values(EnergyEfficient).map((v) => ({ value: v, label: v })),
];

function NewPropertyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { showToast } = useToast();

  // Prefill comes from NewPropertyModal's "Aus Detailbewertung übernehmen"
  // step via query params — that step already has the full row in memory,
  // so there's no need to re-fetch it here. Absent for "Manuell erfassen".
  const [objektkategorie, setObjektkategorie] = useState(searchParams.get('kategorie') ?? '');
  const [kaufdatum, setKaufdatum] = useState<Date | undefined>(undefined);
  const [kaufpreis, setKaufpreis] = useState('');
  const [strasseHausnummer, setStrasseHausnummer] = useState(searchParams.get('strasse') ?? '');
  const [plz, setPlz] = useState(searchParams.get('plz') ?? '');
  const [ort, setOrt] = useState(searchParams.get('ort') ?? '');
  const [bundesland, setBundesland] = useState('');
  const [baujahr, setBaujahr] = useState(searchParams.get('baujahr') ?? '');
  const [wohnflaeche, setWohnflaeche] = useState(searchParams.get('wohnflaeche') ?? '');
  const [anzahlZimmer, setAnzahlZimmer] = useState('');
  const [stellplaetze, setStellplaetze] = useState('0');
  const [energieeffizienz, setEnergieeffizienz] = useState('');
  const [bildBase64, setBildBase64] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Prefilled values (from query params) count as the starting point, not
  // as an unsaved edit — only further changes should count as "dirty".
  const initial = useRef({
    objektkategorie, strasseHausnummer, plz, ort, bundesland, baujahr,
    wohnflaeche, anzahlZimmer, stellplaetze, energieeffizienz, kaufpreis,
    kaufdatum, bildBase64,
  }).current;

  const handleImageSelect = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBildBase64(await readFileAsRawBase64(file));
  };

  const currentYear = new Date().getFullYear();
  const isValid =
    objektkategorie !== '' &&
    strasseHausnummer.trim() !== '' &&
    /^\d{5}$/.test(plz) &&
    ort.trim() !== '' &&
    /^\d{4}$/.test(baujahr) && Number(baujahr) >= 1800 && Number(baujahr) <= currentYear &&
    Number(wohnflaeche) > 0 &&
    stellplaetze !== '' && Number(stellplaetze) >= 0;

  const isEditing =
    objektkategorie !== initial.objektkategorie ||
    strasseHausnummer !== initial.strasseHausnummer ||
    plz !== initial.plz ||
    ort !== initial.ort ||
    bundesland !== initial.bundesland ||
    baujahr !== initial.baujahr ||
    wohnflaeche !== initial.wohnflaeche ||
    anzahlZimmer !== initial.anzahlZimmer ||
    stellplaetze !== initial.stellplaetze ||
    energieeffizienz !== initial.energieeffizienz ||
    kaufpreis !== initial.kaufpreis ||
    kaufdatum !== initial.kaufdatum ||
    bildBase64 !== initial.bildBase64;

  // Any navigation away from an unsaved draft is routed through here so
  // it can be confirmed first (breadcrumb links, the back button).
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

  const handleSave = async () => {
    if (!isValid || !user) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await createProperty({
        userId: user.id,
        cityId: null,
        propertyAbbreviation: null,
        street: strasseHausnummer.trim(),
        houseNumber: '',
        city: ort.trim(),
        postalCode: plz,
        federalState: bundesland.trim(),
        squareMeters: Number(wohnflaeche),
        numberOfRooms: anzahlZimmer !== '' ? Number(anzahlZimmer) : null,
        yearOfConstruction: Number(baujahr),
        energyEfficient: (energieeffizienz || null) as EnergyEfficient | null,
        propertyCategory: objektkategorie,
        imageUrl: bildBase64,
        numberOfUnits: 1,
      });
      if (!created) {
        setError('Objekt konnte nicht gespeichert werden.');
        return;
      }

      if (kaufdatum) {
        await createPropertyAcquisition({
          propertyId: created.propertyId,
          houseCompletionYear: null,
          purchaseDate: format(kaufdatum, 'yyyy-MM-dd'),
          transferDate: null,
        });
      }

      if (kaufpreis !== '' && Number(kaufpreis) > 0) {
        await createAcquisitionCosts({
          propertyId: created.propertyId,
          parkingSpaceId: null,
          propertyPurchasePrice: Number(kaufpreis),
          pricePerSqm: null,
          broker: null,
          brokerValue: null,
          notary: null,
          notaryValue: null,
          landRegistry: null,
          landRegistryValue: null,
          realEstateTax: null,
          realEstateTaxValue: null,
          adjustmentVariable: null,
          adjustmentVariableValue: null,
          totalAncillaryCostsValue: null,
          totalAncillaryCosts: null,
          parkingSpacePurchasePrice: null,
        });
      }

      const parkingCount = Number(stellplaetze);
      if (parkingCount > 0) {
        await createParkingSpace({
          propertyId: created.propertyId,
          parkingSpaceType: 'OTHER',
          numberOfParkingSpaces: parkingCount,
        });
      }

      showToast('Objekt gespeichert.');
      router.push('/existing-properties');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className={PAGE_CONTAINER_CLASS}>
        <Header
          items={[
            {
              ...BESTANDSOBJEKTE_BREADCRUMB_ROOT,
              onClick: (e) => { if (isEditing) { e.preventDefault(); goTo('/existing-properties'); } },
            } satisfies BreadcrumbItem,
            { label: 'Neues Objekt anlegen' },
          ]}
        />

        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">Erfassen Sie die Stammdaten des Bestandsobjekts.</p>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <SectionLabel>Objektbild</SectionLabel>
            <div className="flex items-center gap-4">
              {bildBase64 && (
                <div className="relative shrink-0">
                  <img
                    src={base64ToDataUri(bildBase64)!}
                    alt=""
                    className="w-20 h-20 object-cover rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setBildBase64(null)}
                    aria-label="Bild entfernen"
                    className="absolute -top-2 -right-2 p-1 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <UploadButton
                buttonText={bildBase64 ? 'Anderes Bild wählen' : 'Bild hochladen'}
                accept="image/*"
                onFileSelect={(files) => void handleImageSelect(files)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Objektkategorie</SectionLabel>
            <PillOptions options={PROPERTY_CATEGORY_CREATE_OPTIONS} value={objektkategorie} onChange={setObjektkategorie} />
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Kaufinformationen</SectionLabel>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <NumberField
                label="Kaufpreis"
                optional
                placeholder="450.000"
                unit="€"
                value={kaufpreis}
                onChange={(e) => setKaufpreis(e.target.value)}
                min={0}
              />
              <CalendarField
                label="Kaufdatum"
                optional
                value={kaufdatum}
                onChange={setKaufdatum}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Adresse</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
              <TextField
                label="Straße & Hausnummer"
                placeholder="Beispielstraße 123"
                value={strasseHausnummer}
                onChange={(e) => setStrasseHausnummer(e.target.value)}
              />
              <TextField
                label="PLZ"
                placeholder="80801"
                value={plz}
                onChange={(e) => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
              />
              <TextField
                label="Ort"
                placeholder="München"
                value={ort}
                onChange={(e) => setOrt(e.target.value)}
              />
              <TextField
                label="Bundesland"
                optional
                placeholder="Bayern"
                value={bundesland}
                onChange={(e) => setBundesland(e.target.value)}
                className="sm:col-span-2"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Objektdetails</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NumberField
                label={getLabel('Property', 'YearOfConstruction', 'de')}
                placeholder="1980"
                value={baujahr}
                onChange={(e) => setBaujahr(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <NumberField
                label="Wohnfläche"
                placeholder="100"
                unit="m²"
                value={wohnflaeche}
                onChange={(e) => setWohnflaeche(e.target.value)}
                min={0}
              />
              <NumberField
                label="Anzahl Zimmer"
                optional
                placeholder="3"
                value={anzahlZimmer}
                onChange={(e) => setAnzahlZimmer(e.target.value)}
                min={0}
              />
              <NumberField
                label="Stellplätze"
                placeholder="0"
                value={stellplaetze}
                onChange={(e) => setStellplaetze(e.target.value)}
                min={0}
              />
              <Dropdown
                label="Energieeffizienz"
                optional
                options={ENERGY_OPTIONS}
                value={energieeffizienz}
                onChange={(e) => setEnergieeffizienz(e.target.value)}
              />
            </div>
          </div>
        </div>
      </main>

      <StickyActionBar
        show={true}
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => goTo('/existing-properties')}
        primaryLabel="Objekt speichern"
        primaryIcon={<BUTTON_DETAILS.Save.icon />}
        primaryDisabled={!isEditing || !isValid || isSaving || authLoading}
        onPrimary={() => void handleSave()}
      />

      <UnsavedChangesModal
        open={pendingHref !== null}
        onCancel={() => setPendingHref(null)}
        onDiscard={confirmDiscard}
        context="am neuen Objekt"
      />
    </div>
  );
}

export default function NewPropertyPage() {
  return (
    <Suspense fallback={null}>
      <NewPropertyPageContent />
    </Suspense>
  );
}
