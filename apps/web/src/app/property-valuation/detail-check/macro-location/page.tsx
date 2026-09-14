"use client";

import { LoadingScreen, SectionLabel, StickyActionBar, Tag } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { authFetch } from '@/lib/api/authFetch';
import {
  labelForLight,
  type LocationCategoryScore,
  type LocationScoreResult,
  type SpecialLocationScore,
  type TrafficLight,
} from '@/lib/detailCheck/locationScoring';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

type LocationResponse = LocationScoreResult & {
  workflowId: string;
  quickCheckId: number | null;
};

function lightVariant(light: TrafficLight): 'success' | 'warning' | 'danger' {
  if (light === 'GREEN') return 'success';
  if (light === 'YELLOW') return 'warning';
  return 'danger';
}

function ScoreBar({ label, score, light }: { label: string; score: number; light: TrafficLight }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <Tag label={labelForLight(light)} variant={lightVariant(light)} />
          <span className="tabular-nums font-semibold text-foreground">{score}/100</span>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${
            light === 'GREEN' ? 'bg-success' : light === 'YELLOW' ? 'bg-warning' : 'bg-destructive'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function CategoryPanel({ item }: { item: LocationCategoryScore }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <ScoreBar label={item.label} score={item.score} light={item.light} />
      <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-primary/8">
            <tr>
              <th className="px-3 py-2 font-medium">Unterfaktor</th>
              <th className="px-3 py-2 font-medium">Wert / Daten</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-right font-medium">Gewicht</th>
            </tr>
          </thead>
          <tbody>
            {item.factors.map((factor) => (
              <tr key={factor.label} className="border-t border-border">
                <td className="px-3 py-2">{factor.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{factor.value}</td>
                <td className="px-3 py-2 text-right">{factor.score}</td>
                <td className="px-3 py-2 text-right">{Math.round(factor.weight * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SpecialScoreCard({ item }: { item: SpecialLocationScore }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <ScoreBar label={item.label} score={item.score} light={item.light} />
      <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p>
    </div>
  );
}

function MacroLocationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [data, setData] = useState<LocationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/location-score${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const loaded = await res.json() as LocationResponse;
        if (!cancelled) setData(loaded);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Lagebewertung konnte nicht geladen werden.');
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

  const saveAndNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/location-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickCheckId, workflowId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/property-valuation/detail-check/comparison${suffix}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Lagebewertung konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PropertyValuationLayout
      currentStep={7}
      title="Mikro- und Makrolage"
    >
      <div className="pb-24">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading || !data ? (
          <LoadingScreen message="Lagebewertung wird geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div>
                <p className="text-sm text-muted-foreground">Adresse</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{data.address || 'Adresse noch nicht vollständig erfasst'}</h2>
                <p className="mt-4 text-foreground">{data.summary}</p>
                <p className="mt-3 text-sm text-muted-foreground">{data.dataQuality}</p>
              </div>
              <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                <ScoreBar label="Gesamtscore" score={data.totalScore} light={data.totalLight} />
                <ScoreBar label="Makrolage (40%)" score={data.macroScore} light={data.macroScore >= 70 ? 'GREEN' : data.macroScore >= 50 ? 'YELLOW' : 'RED'} />
                <ScoreBar label="Mikrolage (60%)" score={data.microScore} light={data.microScore >= 70 ? 'GREEN' : data.microScore >= 50 ? 'YELLOW' : 'RED'} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Makrolage-Score</SectionLabel>
              <div className="grid gap-4 pt-1 xl:grid-cols-2">
                {data.macroCategories.map((item) => (
                  <CategoryPanel key={item.label} item={item} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Mikrolage-Score</SectionLabel>
              <div className="grid gap-4 pt-1 xl:grid-cols-2">
                {data.microCategories.map((item) => (
                  <CategoryPanel key={item.label} item={item} />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Spezialscores</SectionLabel>
              <div className="grid gap-4 pt-1 md:grid-cols-2 xl:grid-cols-4">
                {data.specialScores.map((item) => (
                  <SpecialScoreCard key={item.label} item={item} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => router.push(`/property-valuation/detail-check/calculator${suffix}`)}
        secondaryLabel={BUTTON_DETAILS.Skip.label}
        secondaryIcon={<BUTTON_DETAILS.Skip.icon />}
        onSecondary={() => router.push(`/property-valuation/detail-check/comparison${suffix}`)}
        primaryLabel="Weiter"
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving}
        onPrimary={saveAndNext}
      />
    </PropertyValuationLayout>
  );
}

export default function MacroLocationPage() {
  return (
    <Suspense fallback={null}>
      <MacroLocationContent />
    </Suspense>
  );
}
