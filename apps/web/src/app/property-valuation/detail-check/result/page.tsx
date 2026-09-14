"use client";

import { Button, SectionLabel, StickyActionBar, Tag, type TagVariant } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import { type MetricStatus, type RecommendationLevel, type RecommendationMetric, type RecommendationScorePart } from '@/lib/detailCheck/recommendation';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type RecommendationResponse = {
  workflowId: string;
  quickCheckId: number | null;
  selectedFinancingVariant: 'OFFER' | 'INDIVIDUAL';
  recommendationScore: number;
  level: RecommendationLevel;
  label: string;
  summary: string;
  metrics: RecommendationMetric[];
  scoreParts: RecommendationScorePart[];
  missingDefinitions: string[];
  assumptions: string[];
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function formatMetric(metric: RecommendationMetric): string {
  if (metric.value == null) return 'Noch nicht ermittelt';
  if (metric.unit === 'PERCENT') return `${decimalFormatter.format(metric.value)} %`;
  if (metric.unit === 'EUR' || metric.unit === 'EUR_MONTH') {
    const suffix = metric.unit === 'EUR_MONTH' ? ' €/Monat' : ' €';
    return `${currencyFormatter.format(metric.value)}${suffix}`;
  }
  return String(metric.value);
}

function statusTag(status: MetricStatus) {
  const labels: Record<MetricStatus, string> = {
    DEFINED: 'definiert',
    FALLBACK: 'MVP-Annahme',
    UNDEFINED: 'noch offen',
  };
  const variants: Record<MetricStatus, TagVariant> = {
    DEFINED: 'success',
    FALLBACK: 'warning',
    UNDEFINED: 'danger',
  };
  return <Tag label={labels[status]} variant={variants[status]} />;
}

function levelVariant(level: RecommendationLevel): TagVariant {
  if (level === 'BUY') return 'success';
  if (level === 'CHECK') return 'info';
  if (level === 'CRITICAL') return 'warning';
  return 'danger';
}

function MetricRow({ metric }: { metric: RecommendationMetric }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-3 align-top text-sm font-medium text-foreground">{metric.label}</td>
      <td className="px-3 py-3 align-top text-right text-sm font-semibold text-foreground">{formatMetric(metric)}</td>
      <td className="px-3 py-3 align-top">{statusTag(metric.status)}</td>
      <td className="px-3 py-3 align-top text-sm text-muted-foreground">{metric.note}</td>
    </tr>
  );
}

function ScorePartCard({ part }: { part: RecommendationScorePart }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{part.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Gewichtung {Math.round(part.weight * 100)} %</p>
        </div>
        {statusTag(part.status)}
      </div>
      <div className="mb-3 flex items-end gap-2">
        <span className="text-3xl font-semibold text-foreground">{decimalFormatter.format(part.score)}</span>
        <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, part.score))}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{part.note}</p>
    </section>
  );
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/recommendation${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const loaded = await res.json() as RecommendationResponse;
        if (!cancelled) setData(loaded);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Empfehlung konnte nicht geladen werden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [suffix]);

  const saveRecommendation = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await authFetch('/api/detail-check/recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickCheckId, workflowId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json() as RecommendationResponse;
      setData(saved);
      setSavedMessage('Empfehlung wurde gespeichert.');
      router.push('/property-valuation/detail-check');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Empfehlung konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PropertyValuationLayout
      currentStep={9}
      title="Empfehlung"
      actions={
        <Button
          label="Zur Übersicht"
          variant="outline"
          hideLabelOnMobile
          onClick={() => router.push('/property-valuation/detail-check')}
        />
      }
    >
      <div className="pb-24">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {savedMessage && (
          <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            {savedMessage}
          </div>
        )}

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Empfehlung wird berechnet...</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">Investment-Score</span>
                  <Tag label={data.label} variant={levelVariant(data.level)} size="md" />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-semibold text-foreground">{decimalFormatter.format(data.recommendationScore)}</span>
                  <span className="pb-2 text-base text-muted-foreground">/ 100</span>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, data.recommendationScore))}%` }} />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Auswertung</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{data.summary}</p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Gewählte Finanzierung: <span className="font-medium text-foreground">{data.selectedFinancingVariant === 'INDIVIDUAL' ? 'Individuell' : 'Angebot'}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Kennzahlen</SectionLabel>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full border-collapse">
                  <thead className="bg-primary/8">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kennzahl</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wert</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ermittlung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metrics.map((metric) => (
                      <MetricRow key={metric.key} metric={metric} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Score-Bausteine</SectionLabel>
              <div className="grid gap-4 pt-1 md:grid-cols-2 xl:grid-cols-5">
                {data.scoreParts.map((part) => (
                  <ScorePartCard key={part.key} part={part} />
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Noch nicht definierte Ermittlung</h2>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {data.missingDefinitions.map((item) => (
                    <li key={item} className="rounded-md bg-muted px-3 py-2">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Aktuelle MVP-Annahmen</h2>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {data.assumptions.map((item) => (
                    <li key={item} className="rounded-md bg-muted px-3 py-2">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => router.push(`/property-valuation/detail-check/comparison${suffix}`)}
        primaryLabel="Speichern"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving}
        onPrimary={saveRecommendation}
      />
    </PropertyValuationLayout>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultContent />
    </Suspense>
  );
}
