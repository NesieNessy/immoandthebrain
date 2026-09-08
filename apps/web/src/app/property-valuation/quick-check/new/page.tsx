"use client";

import { NoResult } from '@/components/common';
import { KpfAssessmentCard } from '@/components/features/KpfAssessmentCard';
import { MobileResultBanner } from '@/components/features/MobileResultBanner';
import { CONDITION_OPTIONS, getQuickCheckFieldErrors } from '@/components/features/QuickCheckDisplay';
import { PortalImportSection } from '@/components/features/PortalImportSection';
import { Button, Dropdown, Header, NumberField, PAGE_CONTAINER_CLASS, StickyActionBar, TextField, UnsavedChangesModal, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { FieldLabels } from '@/constants/FieldLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createQuickCheck } from '@/lib/supabase/quick_check.supabase';
import { calcKpf } from '@/lib/quickCheck/kpf';
import { isValidConstructionYear } from '@/lib/quickCheck/validation';
import { PropertyCondition } from '@immonext/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  street: string;
  postalCode: string;
  city: string;
  purchasePrice: string;
  coldRent: string;
  condition: PropertyCondition | '';
  yearOfConstruction: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuickCheckPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { showToast } = useToast();
  const [portalUrl, setPortalUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    street: '',
    postalCode: '',
    city: '',
    purchasePrice: '',
    coldRent: '',
    condition: '',
    yearOfConstruction: '',
  });

  const purchasePrice = parseFloat(form.purchasePrice) || 0;
  const coldRent = parseFloat(form.coldRent) || 0;
  const condition = form.condition as PropertyCondition | '';

  const kpf = calcKpf(purchasePrice, coldRent);

  const currentYear = new Date().getFullYear();

  // Per-field validation — only shown when the field has been touched (non-empty)
  const fieldErrors = getQuickCheckFieldErrors(form, purchasePrice, coldRent, currentYear);

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid =
    form.street.trim() !== '' &&
    form.street.trim().length <= 120 &&
    /^\d{5}$/.test(form.postalCode) &&
    form.city.trim() !== '' &&
    form.city.trim().length <= 120 &&
    purchasePrice > 0 &&
    coldRent > 0 &&
    form.condition !== '' &&
    isValidConstructionYear(parseInt(form.yearOfConstruction, 10), currentYear);

  const isEditing = portalUrl !== '' || Object.values(form).some((value) => value !== '');

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

  // Shared by "Übernehmen" and "Detailbewertung starten" — both need the
  // quick-check saved first; they just navigate to a different place after.
  const saveQuickCheck = async () => {
    if (!isFormValid || isSaving || !user) return null;
    const computedKpf = calcKpf(purchasePrice, coldRent);
    if (computedKpf === null) return null;

    setIsSaving(true);
    try {
      return await createQuickCheck({
        userId: user.id,
        portalId: portalUrl || undefined,
        purchasePrice,
        coldRent,
        street: form.street.trim(),
        postalCode: form.postalCode,
        city: form.city.trim(),
        yearOfConstruction: parseInt(form.yearOfConstruction, 10),
        condition: condition as PropertyCondition,
        kpfMultiplier: computedKpf,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTakeOver = async () => {
    try {
      const created = await saveQuickCheck();
      if (!created) return;
      showToast('Ersteinschätzung gespeichert.');
      router.push('/property-valuation/quick-check');
    } catch (error) {
      console.error('Speichern fehlgeschlagen', error);
    }
  };

  const handleStartDetailCheck = async () => {
    try {
      const created = await saveQuickCheck();
      if (!created) return;
      router.push(`/property-valuation/detail-check/property-data?quickCheckId=${created.quickCheckId}`);
    } catch (error) {
      console.error('Detailbewertung starten fehlgeschlagen', error);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {/* ── Main page ─────────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-background pb-20">

        <main className={PAGE_CONTAINER_CLASS}>
          <Header
            items={[
              { label: 'Objektbewertung' },
              {
                label: 'Ersteinschätzungen',
                href: '/property-valuation/quick-check',
                onClick: (e) => { if (isEditing) { e.preventDefault(); goTo('/property-valuation/quick-check'); } },
              } satisfies BreadcrumbItem,
              { label: 'Neue Ersteinschätzung' },
            ]}
            actions={
              <Button
                label={BUTTON_DETAILS.StartDetailCheck.label}
                icon={<BUTTON_DETAILS.StartDetailCheck.icon />}
                variant="outline"
                hideLabelOnMobile
                disabled={!isFormValid || isSaving || authLoading || !user}
                onClick={() => void handleStartDetailCheck()}
              />
            }
          />
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
            <MobileResultBanner show={isFormValid} resultId="qc-result" formTopId="qc-form-top" />

            {/* Form */}
            <div className="flex flex-col gap-3 p-5">
              {/* Address */}
              <section id="qc-form-top">
                <h2 className="text-md font-semibold text-foreground mb-2">Informationen zur Berechnung</h2>

                <PortalImportSection portalUrl={portalUrl} onPortalUrlChange={setPortalUrl} />

                <div className="flex flex-col gap-2 pt-1.5">
                  <TextField
                    label={FieldLabels.Property.Street.de + ' & ' + FieldLabels.Property.HouseNumber.de}
                    placeholder="z.B. Hauptstraße 123"
                    required
                    value={form.street}
                    onChange={(e) => handleFieldChange('street', e.target.value)}
                    error={fieldErrors.street}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextField
                      label={FieldLabels.Property.PostalCode.de}
                      placeholder="z.B. 10115"
                      required
                      value={form.postalCode}
                      onChange={(e) => handleFieldChange('postalCode', e.target.value)}
                      error={fieldErrors.postalCode}
                    />
                    <TextField
                      label={FieldLabels.Property.City.de}
                      placeholder="z.B. Berlin"
                      required
                      value={form.city}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                      error={fieldErrors.city}
                    />
                  </div>
                </div>
              </section>

              {/* Financial */}
              <section>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={FieldLabels.AcquisitionCosts.PurchasePrice.de}
                    placeholder="z.B. 450000"
                    unit="€"
                    required
                    value={form.purchasePrice}
                    onChange={(e) => handleFieldChange('purchasePrice', e.target.value)}
                    min={0}
                    error={fieldErrors.purchasePrice}
                  />
                  <NumberField
                    label={FieldLabels.Tenancy.ColdRent.de}
                    placeholder="z.B. 1800"
                    unit="€"
                    required
                    value={form.coldRent}
                    onChange={(e) => handleFieldChange('coldRent', e.target.value)}
                    min={0}
                    error={fieldErrors.coldRent}
                  />
                </div>
              </section>

              {/* Property details */}
              <section>
                <div className="grid grid-cols-2 gap-2">
                  <Dropdown
                    label="Zustand"
                    options={CONDITION_OPTIONS}
                    required
                    value={form.condition}
                    onChange={(e) => handleFieldChange('condition', e.target.value)}
                  />
                  <NumberField
                    label={FieldLabels.Property.YearOfConstruction.de}
                    placeholder="z.B. 1995"
                    required
                    value={form.yearOfConstruction}
                    onChange={(e) => handleFieldChange('yearOfConstruction', e.target.value)}
                    min={1850}
                    max={new Date().getFullYear()}
                    error={fieldErrors.yearOfConstruction}
                  />
                </div>
              </section>
            </div>

            {/* Result */}
            <div id="qc-result" className="flex flex-col gap-4 p-5">
              {!isFormValid ? (
                <NoResult />
              ) : (
                <KpfAssessmentCard
                  street={form.street}
                  postalCode={form.postalCode}
                  city={form.city}
                  purchasePrice={purchasePrice}
                  coldRent={coldRent}
                  condition={condition}
                  yearOfConstruction={form.yearOfConstruction}
                  kpf={kpf}
                />
              )}
            </div>

            {/* ── Action buttons — sticky bar at the bottom of the viewport ── */}
          </div>
        </main>

        <StickyActionBar
          show={true}
          ghostLabel={BUTTON_DETAILS.Back.label}
          ghostIcon={<BUTTON_DETAILS.Back.icon />}
          onGhost={() => goTo('/property-valuation/quick-check')}
          primaryLabel="Ersteinschätzung speichern"
          primaryIcon={<BUTTON_DETAILS.Save.icon />}
          primaryDisabled={!isFormValid || isSaving || authLoading || !user}
          onPrimary={handleTakeOver}
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
