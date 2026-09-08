"use client";

import { NoResult } from '@/components/common';
import { KpfAssessmentCard } from '@/components/features/KpfAssessmentCard';
import { MobileResultBanner } from '@/components/features/MobileResultBanner';
import { CONDITION_OPTIONS, getQuickCheckFieldErrors } from '@/components/features/QuickCheckDisplay';
import { PortalImportSection } from '@/components/features/PortalImportSection';
import { Button, Dropdown, Header, LoadingScreen, NotFoundScreen, NumberField, PAGE_CONTAINER_CLASS, StickyActionBar, TextField, UnsavedChangesModal, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { FieldLabels } from '@/constants/FieldLabels';
import { useQuickCheckById } from '@/hooks/useQuickCheckById';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  acceptQuickCheck,
  discardQuickCheck,
  updateQuickCheck,
} from '@/lib/supabase/quick_check.supabase';
import { cn } from '@/lib/utils';
import { calcKpf } from '@/lib/quickCheck/kpf';
import { isValidConstructionYear } from '@/lib/quickCheck/validation';
import { PropertyCondition } from '@immonext/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditForm {
  street: string;
  postalCode: string;
  city: string;
  purchasePrice: string;
  coldRent: string;
  condition: PropertyCondition | '';
  yearOfConstruction: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props { id: number; }

export function QuickCheckResultView({ id }: Props) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { showToast } = useToast();
  const { data, isLoading, error } = useQuickCheckById(id);

  // Edit form (ACTIVE state)
  const [editForm, setEditForm] = useState<EditForm>({
    street: '', postalCode: '', city: '', purchasePrice: '', coldRent: '', condition: '', yearOfConstruction: '',
  });
  const [portalUrl, setPortalUrl] = useState('');

  // UI state
  const [isBusy, setIsBusy] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Snapshot of the loaded values (to detect whether the user has changed
  // anything since the record was fetched) — a pure function of `data`, so
  // derived rather than duplicated into its own state.
  const initialForm: EditForm | null = useMemo(() => data && ({
    street:             data.street,
    postalCode:         data.postalCode,
    city:               data.city,
    purchasePrice:      String(data.purchasePrice),
    coldRent:           String(data.coldRent),
    condition:          data.condition,
    yearOfConstruction: String(data.yearOfConstruction),
  }), [data]);
  const initialPortalUrl = data?.portalId ?? '';

  // Pre-fill edit form when record loads
  useEffect(() => {
    if (!initialForm) return;
    setEditForm(initialForm);
    setPortalUrl(initialPortalUrl);
  }, [initialForm, initialPortalUrl]);

  // Derived edit-form values
  const purchasePrice = parseFloat(editForm.purchasePrice) || 0;
  const coldRent      = parseFloat(editForm.coldRent) || 0;
  const condition     = editForm.condition as PropertyCondition | '';
  const currentYear   = new Date().getFullYear();

  const kpf = calcKpf(purchasePrice, coldRent);

  // Validation
  const editErrors = getQuickCheckFieldErrors(editForm, purchasePrice, coldRent, currentYear);

  // Shared by isEditValid and canShowResult — everything the KPF calculation
  // itself needs (it never uses street/city).
  const financialsValid =
    /^\d{5}$/.test(editForm.postalCode) &&
    purchasePrice > 0 && coldRent > 0 && condition !== '' &&
    isValidConstructionYear(parseInt(editForm.yearOfConstruction, 10), currentYear);

  const isEditValid =
    financialsValid &&
    editForm.street.trim() !== '' &&
    editForm.street.trim().length <= 120 &&
    editForm.city.trim() !== '' &&
    editForm.city.trim().length <= 120;

  // "Verwerfen"/"Übernehmen" also require the user to have actually changed
  // something compared to the loaded record.
  const hasChanges =
    initialForm !== null &&
    (editForm.street !== initialForm.street ||
      editForm.postalCode !== initialForm.postalCode ||
      editForm.city !== initialForm.city ||
      editForm.purchasePrice !== initialForm.purchasePrice ||
      editForm.coldRent !== initialForm.coldRent ||
      editForm.condition !== initialForm.condition ||
      editForm.yearOfConstruction !== initialForm.yearOfConstruction ||
      portalUrl !== initialPortalUrl);

  // Any navigation away from an unsaved edit is routed through here so it
  // can be confirmed first (breadcrumb links).
  const goTo = (href: string) => {
    if (hasChanges) {
      setPendingHref(href);
    } else {
      router.push(href);
    }
  };

  const confirmDiscard = () => {
    if (pendingHref) router.push(pendingHref);
    setPendingHref(null);
  };

  // Whether the KPF result panel can be shown — independent of street/city,
  // since the calculation itself only needs price, rent, postal code,
  // condition and year. Legacy records can have a missing address.
  const canShowResult = financialsValid;

  // On mobile, jump straight to the result on first load — this view is for
  // an already-computed record, so there's no reason to make the user
  // scroll past the form first. Runs once; matches the `lg` breakpoint
  // where the two-column layout takes over and scrolling is unnecessary.
  const hasAutoScrolled = useRef(false);
  useEffect(() => {
    if (hasAutoScrolled.current || !canShowResult) return;
    if (window.innerWidth >= 1024) return;
    hasAutoScrolled.current = true;
    document.getElementById('qc-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [canShowResult]);

  // Handlers
  const handleEditField = (f: keyof EditForm, v: string) =>
    setEditForm((p) => ({ ...p, [f]: v }));

  // Saves any pending edits, then accepts the quick-check into the
  // Portfolio (creates a property from the street/city/postal_code/year
  // already on the quick_check row) and returns to the overview.
  const handleTakeOver = async () => {
    if (!user || !isEditValid || !hasChanges) return;
    setIsBusy(true);
    try {
      await updateQuickCheck(id, {
        userId: user.id,
        portalId: portalUrl || undefined,
        purchasePrice, coldRent,
        street:             editForm.street.trim(),
        postalCode:         editForm.postalCode,
        city:               editForm.city.trim(),
        yearOfConstruction: parseInt(editForm.yearOfConstruction, 10),
        condition:          condition as PropertyCondition,
        kpfMultiplier:      calcKpf(purchasePrice, coldRent) ?? 0,
      });
      await acceptQuickCheck(id, user.id);
      showToast('Ersteinschätzung gespeichert.');
      router.push('/property-valuation/quick-check');
    } catch (err) {
      console.error('Übernehmen fehlgeschlagen', err);
    } finally {
      setIsBusy(false);
    }
  };

  // Jumps into the wizard. The row only moves into the detail-check overview after the
  // first detail-check page was saved successfully.
  const handleStartDetailCheck = async () => {
    setIsBusy(true);
    try {
      router.push(`/property-valuation/detail-check/property-data?quickCheckId=${id}`);
    } catch (err) {
      console.error('Detailbewertung starten fehlgeschlagen', err);
      setIsBusy(false);
    }
  };

  // Always leaves back to the overview — that's its main job. The actual
  // DISCARD write only happens when there's something meaningful to record
  // (record still pending a decision, and the user actually changed something).
  const handleDiscard = async () => {
    if (user && hasChanges) {
      setIsBusy(true);
      try {
        await discardQuickCheck(id, user.id);
      } catch (err) {
        console.error('Verwerfen fehlgeschlagen', err);
      } finally {
        setIsBusy(false);
      }
    }
    router.push('/property-valuation/quick-check');
  };

  // Guards — loading, error, and not-found each need their own state.
  if (authLoading || isLoading) return <LoadingScreen message="Ergebnis wird geladen…" />;
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className={cn('text-sm', 'text-destructive')}>{`Fehler: ${error}`}</p>
      </div>
    );
  }
  if (!data) return <NotFoundScreen message="Ersteinschätzung nicht gefunden." />;

  // Editable form (ACTIVE)
  return (
    <>
      {/* Main page */}
      <div className="min-h-screen bg-background pb-20">
        <main className={PAGE_CONTAINER_CLASS}>
          <Header
            items={[
              { label: 'Objektbewertung' },
              {
                label: 'Ersteinschätzungen',
                href: '/property-valuation/quick-check',
                onClick: (e) => { if (hasChanges) { e.preventDefault(); goTo('/property-valuation/quick-check'); } },
              } satisfies BreadcrumbItem,
              { label: editForm.street || 'Immobilien-Ersteinschätzung' },
            ]}
            actions={
              <Button
                label={BUTTON_DETAILS.StartDetailCheck.label}
                icon={<BUTTON_DETAILS.StartDetailCheck.icon />}
                variant="outline"
                hideLabelOnMobile
                disabled={isBusy}
                onClick={() => void handleStartDetailCheck()}
              />
            }
          />

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
            <MobileResultBanner show={canShowResult} resultId="qc-result" formTopId="qc-form-top" />

            {/* Form */}
            <div className="flex flex-col gap-3">
              <section id="qc-form-top">
                <h2 className="text-md font-semibold text-foreground mb-2">
                  Informationen zur Berechnung
                </h2>

                <PortalImportSection portalUrl={portalUrl} onPortalUrlChange={setPortalUrl} />

                <div className="flex flex-col gap-2 pt-1.5">
                  <TextField
                    label={FieldLabels.Property.Street.de + ' & ' + FieldLabels.Property.HouseNumber.de}
                    placeholder="z.B. Hauptstraße 123"
                    required
                    value={editForm.street}
                    onChange={(e) => handleEditField('street', e.target.value)}
                    error={editErrors.street}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextField
                      label={FieldLabels.Property.PostalCode.de}
                      placeholder="z.B. 10115"
                      required
                      value={editForm.postalCode}
                      onChange={(e) => handleEditField('postalCode', e.target.value)}
                      error={editErrors.postalCode}
                    />
                    <TextField
                      label={FieldLabels.Property.City.de}
                      placeholder="z.B. Berlin"
                      required
                      value={editForm.city}
                      onChange={(e) => handleEditField('city', e.target.value)}
                      error={editErrors.city}
                    />
                  </div>
                </div>
              </section>
              <section>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={FieldLabels.AcquisitionCosts.PurchasePrice.de}
                    placeholder="z.B. 450000"
                    unit="€"
                    required
                    value={editForm.purchasePrice}
                    onChange={(e) => handleEditField('purchasePrice', e.target.value)}
                    min={0}
                    error={editErrors.purchasePrice}
                  />
                  <NumberField
                    label={FieldLabels.Tenancy.ColdRent.de}
                    placeholder="z.B. 1800"
                    unit="€"
                    required
                    value={editForm.coldRent}
                    onChange={(e) => handleEditField('coldRent', e.target.value)}
                    min={0}
                    error={editErrors.coldRent}
                  />
                </div>
              </section>
              <section>
                <div className="grid grid-cols-2 gap-2">
                  <Dropdown
                    label="Zustand"
                    options={CONDITION_OPTIONS}
                    required
                    value={editForm.condition}
                    onChange={(e) => handleEditField('condition', e.target.value)}
                  />
                  <NumberField
                    label={FieldLabels.Property.YearOfConstruction.de}
                    placeholder="z.B. 1995"
                    required
                    value={editForm.yearOfConstruction}
                    onChange={(e) => handleEditField('yearOfConstruction', e.target.value)}
                    min={1850}
                    max={currentYear}
                    error={editErrors.yearOfConstruction}
                  />
                </div>
              </section>
            </div>

            {/* Result */}
            <div id="qc-result" className="flex flex-col gap-4">
              {!canShowResult ? (
                <NoResult />
              ) : (
                <KpfAssessmentCard
                  street={editForm.street}
                  postalCode={editForm.postalCode}
                  city={editForm.city}
                  purchasePrice={purchasePrice}
                  coldRent={coldRent}
                  condition={condition}
                  yearOfConstruction={editForm.yearOfConstruction}
                  kpf={kpf}
                />
              )}
            </div>
          </div>
        </main>

        <StickyActionBar
          show={true}
          ghostLabel={BUTTON_DETAILS.Back.label}
          ghostIcon={<BUTTON_DETAILS.Back.icon />}
          ghostDisabled={isBusy}
          onGhost={handleDiscard}
          primaryLabel="Ersteinschätzung speichern"
          primaryIcon={<BUTTON_DETAILS.Save.icon />}
          primaryDisabled={!isEditValid || isBusy || !hasChanges}
          onPrimary={() => void handleTakeOver()}
        />

        <UnsavedChangesModal
          open={pendingHref !== null}
          onCancel={() => setPendingHref(null)}
          onDiscard={confirmDiscard}
          context="an der Ersteinschätzung"
        />
      </div>
    </>
  );
}
