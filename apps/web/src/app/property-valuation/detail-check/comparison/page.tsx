"use client";

import { Button, LoadingScreen, ReadOnlyField, StickyActionBar, Tag } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import { type ReferenceProperty, type SubjectProperty } from '@/lib/detailCheck/comparison';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type ComparisonResponse = {
  workflowId: string;
  quickCheckId: number | null;
  subject: SubjectProperty;
  references: ReferenceProperty[];
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)} €`;
}

function formatArea(value: number): string {
  return `${decimalFormatter.format(value)} m²`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <ReadOnlyField value={value || '-'} align="right" emphasis />
    </div>
  );
}

function SimilarityTag({ score, label }: { score: number; label: string }) {
  const variant = score <= 20 ? 'success' : score <= 45 ? 'warning' : 'danger';
  return <Tag label={`${label} · ${decimalFormatter.format(score)}`} variant={variant} />;
}

function SubjectCard({ subject }: { subject: SubjectProperty }) {
  return (
    <section className="grid gap-6 lg:grid-cols-[280px_minmax(0,420px)] lg:items-start">
      <div>
        <h2 className="mb-4 text-xl font-medium text-foreground">Ihr Objekt</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            Objekt
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">{subject.address || 'Adresse noch nicht vollständig'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {subject.denseMarket ? 'Ballungsgebiet: PLZ muss identisch sein' : 'Regelfall: PLZ oder Stadt werden verglichen'}
          </p>
        </div>
      </div>
      <div className="space-y-3 pt-0 lg:pt-10">
        <InfoRow label="Verkaufspreis" value={formatCurrency(subject.purchasePrice)} />
        <InfoRow label="Kaltmiete" value={formatCurrency(subject.coldRent)} />
        <InfoRow label="Wohnfläche" value={formatArea(subject.livingAreaM2)} />
        <InfoRow label="Baujahr" value={String(subject.yearOfConstruction || '')} />
        <InfoRow label="Kaufpreis/m²" value={formatCurrency(subject.purchasePricePerM2)} />
        <InfoRow label="Mietfaktor" value={decimalFormatter.format(subject.purchasePriceRentQuotient)} />
      </div>
    </section>
  );
}

function ReferenceCard({ item, index }: { item: ReferenceProperty; index: number }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {index + 1}
        </div>
        <SimilarityTag score={item.similarityScore} label={item.deviationLabel} />
      </div>
      <p className="mb-4 min-h-10 text-sm font-medium text-foreground">{item.address}</p>
      <div className="space-y-3">
        <InfoRow label="Verkaufspreis" value={formatCurrency(item.purchasePrice)} />
        <InfoRow label="Kaltmiete" value={formatCurrency(item.coldRent)} />
        <InfoRow label="Wohnfläche" value={formatArea(item.livingAreaM2)} />
        <InfoRow label="Baujahr" value={String(item.yearOfConstruction)} />
        <InfoRow label="Mietfaktor" value={decimalFormatter.format(item.purchasePriceRentQuotient)} />
      </div>
    </section>
  );
}

function ComparisonContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/comparison${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const loaded = await res.json() as ComparisonResponse;
        if (!cancelled) setData(loaded);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Vergleich konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [suffix]);

  const saveAndNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickCheckId, workflowId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/property-valuation/detail-check/result${suffix}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Vergleich konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PropertyValuationLayout
      currentStep={8}
      title="Vergleich"
      showFieldLegend
      actions={
        <Button
          label="Überspringen"
          variant="outline"
          hideLabelOnMobile
          onClick={() => router.push(`/property-valuation/detail-check/result${suffix}`)}
        />
      }
    >
      <div className="pb-24">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading || !data ? (
          <LoadingScreen message="Vergleich wird geladen…" fullScreen={false} />
        ) : (
          <div className="space-y-10">
            <SubjectCard subject={data.subject} />

            <section>
              <div className="mb-4 flex items-center gap-4">
                <h2 className="rounded-lg border border-border bg-card px-4 py-2 text-lg font-medium text-foreground">
                  Andere Kunden
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>

              {data.references.length === 0 ? (
                <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                  Keine passenden Referenzobjekte gefunden. Für Ballungsgebiete muss die Postleitzahl identisch sein; zusätzlich gelten Kaltmiete +/- 200 €, Wohnfläche +/- 10 m² und Baujahr +/- 5 Jahre.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-3">
                  {data.references.map((item, index) => (
                    <ReferenceCard key={item.id} item={item} index={index} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => router.push(`/property-valuation/detail-check/macro-location${suffix}`)}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving}
        onPrimary={saveAndNext}
      />
    </PropertyValuationLayout>
  );
}

export default function ComparisonPage() {
  return (
    <Suspense fallback={null}>
      <ComparisonContent />
    </Suspense>
  );
}
