"use client";

import { NoResult } from '@/components/common';
import { KpfAssessmentCard } from '@/components/features/KpfAssessmentCard';
import { MobileResultBanner } from '@/components/features/MobileResultBanner';
import { CONDITION_OPTIONS, getQuickCheckFieldErrors } from '@/components/features/QuickCheckDisplay';
import { PortalImportSection } from '@/components/features/PortalImportSection';
import { Dropdown, Header, LoadingScreen, NotFoundScreen, NumberField, PAGE_CONTAINER_CLASS, StickyActionBar, TextField, UnsavedChangesModal, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { FieldLabels } from '@/constants/FieldLabels';
import { useQuickCheckById } from '@/hooks/useQuickCheckById';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  acceptQuickCheck,
  discardQuickCheck,
  updateQuickCheck,
} from '@/lib/supabase/quick_check.supabase';
import { isValidListingUrl } from '@/lib/listingUrl';
import { cn } from '@/lib/utils';
import { calcKpf } from '@/lib/quickCheck/kpf';
import { isValidConstructionYear } from '@/lib/quickCheck/validation';
import { PropertyCondition } from '@immoandthebrain/types';
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

  // Derived from `data` rather than its own state, so it stays a snapshot of the loaded record.
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

  // Shared by isEditValid and canShowResult: everything the KPF calc needs (never street/city).
  const financialsValid =
    /^\d{5}$/.test(editForm.postalCode) &&
    purchasePrice > 0 && coldRent > 0 && condition !== '' &&
    isValidConstructionYear(parseInt(editForm.yearOfConstruction, 10), currentYear);

  const isEditValid =
    financialsValid &&
    editForm.street.trim() !== '' &&
    editForm.street.trim().length <= 120 &&
    editForm.city.trim() !== '' &&
    editForm.city.trim().length <= 120 &&
    // Older records can hold plain text here from before links were validated;
    // block save until it's corrected instead of failing server-side.
    (!portalUrl.trim() || isValidListingUrl(portalUrl));

  // "Verwerfen"/"Übernehmen" also require an actual change vs. the loaded record.
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

  // Routes navigation through here so an unsaved edit can be confirmed first.
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

  // Independent of street/city so legacy records with a missing address can still show a result.
  const canShowResult = financialsValid;

  // Auto-scroll to the result on mobile first load, since this view is for an
  // already-computed record. Skipped at the `lg` breakpoint where both columns are visible.
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

  // Saves pending edits, then accepts the quick-check into the portfolio
  // (creates a property from the quick_check row) and returns to the overview.
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

  // Row moves into the detail-check overview only after its first detail-check page is saved.
  const handleStartDetailCheck = async () => {
    setIsBusy(true);
    try {
      router.push(`/property-valuation/detail-check/property-data?quickCheckId=${id}`);
    } catch (err) {
      console.error('Detailbewertung starten fehlgeschlagen', err);
      setIsBusy(false);
    }
  };

  // Always navigates back; the discard write only fires if the user actually changed something.
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
          />

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-6">
            <MobileResultBanner show={canShowResult} resultId="qc-result" formTopId="qc-form-top" />

            {/* Form */}
            <div className="flex flex-col gap-3">
              <section id="qc-form-top">
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
            <div id="qc-result" className="flex h-full flex-col justify-center gap-4">
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
          secondaryLabel={BUTTON_DETAILS.StartDetailCheck.label}
          secondaryIcon={<BUTTON_DETAILS.StartDetailCheck.icon />}
          secondaryDisabled={isBusy}
          onSecondary={() => void handleStartDetailCheck()}
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
