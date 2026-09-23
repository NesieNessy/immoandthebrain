"use client";

import { SectionLabel, Tag } from '@/components/ui';
import type { CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { USE_CASES, USE_CASE_GROUP_LABELS, isAvailable, type UseCaseGroup, type UseCaseId } from '@/lib/detailCheck/analysis/catalog';
import { buildAnalysisCards, type AnalysisCard, type CardSeries } from '@/lib/detailCheck/analysis/cards';
import type { RentCalculatorResult } from '@/lib/detailCheck/analysis/metrics';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'detail-check:analysis-use-cases';
const DEFAULT_SELECTION: UseCaseId[] = ['break-even'];
const GROUPS: UseCaseGroup[] = ['auswertung', 'simulation', 'optimierung'];
const MIN_VIEW_PERIOD_YEARS = 5;
const MAX_VIEW_PERIOD_YEARS = 50;

function readSelection(): UseCaseId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter((id): id is UseCaseId => USE_CASES.some((item) => item.id === id)) : DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

function MiniChart({ series }: { series: CardSeries }) {
  const { values, markerIndex } = series;
  if (values.length < 2) return null;
  const width = 320;
  const height = 80;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {markerIndex != null && <circle cx={x(markerIndex)} cy={y(values[markerIndex])} r={4} fill="var(--warning)" />}
    </svg>
  );
}

function Card({ card }: { card: AnalysisCard }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">{card.title}</h3>
        <Tag label={card.verdict.label} variant={card.verdict.tone} />
      </div>
      {card.series && <MiniChart series={card.series} />}
      {card.rows.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {card.rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                <td className="py-1.5 text-right font-medium text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {card.note && <p className="mt-2 text-xs text-muted-foreground">{card.note}</p>}
    </article>
  );
}

export function AnalysisPanel({
  result,
  params,
  cases,
  viewPeriodYears,
  onViewPeriodYearsChange,
}: {
  result: RentCalculatorResult;
  params: CalculatorParams;
  cases: RenovationCase[];
  viewPeriodYears: number;
  onViewPeriodYearsChange: (years: number) => void;
}) {
  const [selected, setSelected] = useState<UseCaseId[]>(DEFAULT_SELECTION);
  useEffect(() => setSelected(readSelection()), []);

  const [viewPeriodDraft, setViewPeriodDraft] = useState(String(viewPeriodYears));
  useEffect(() => setViewPeriodDraft(String(viewPeriodYears)), [viewPeriodYears]);

  const toggle = (id: UseCaseId) => {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ohne Speicher weiter */ }
      return next;
    });
  };

  const isValidYears = (parsed: number) =>
    Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= MIN_VIEW_PERIOD_YEARS && parsed <= MAX_VIEW_PERIOD_YEARS;

  const handleViewPeriodDraftChange = (raw: string) => {
    setViewPeriodDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && isValidYears(parsed)) {
      onViewPeriodYearsChange(parsed);
    }
  };

  const commitViewPeriodDraft = () => {
    const parsed = Number(viewPeriodDraft);
    const clamped =
      viewPeriodDraft.trim() === '' || !Number.isFinite(parsed)
        ? viewPeriodYears
        : Math.min(MAX_VIEW_PERIOD_YEARS, Math.max(MIN_VIEW_PERIOD_YEARS, Math.round(parsed)));
    onViewPeriodYearsChange(clamped);
    setViewPeriodDraft(String(clamped));
  };

  const cards = useMemo(
    () => buildAnalysisCards({ selected, result, params, cases, viewPeriodYears }),
    [selected, result, params, cases, viewPeriodYears],
  );

  return (
    <section className="order-3 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionLabel>Auswertungen</SectionLabel>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Betrachtungszeitraum
          <input
            type="number"
            min={MIN_VIEW_PERIOD_YEARS}
            max={MAX_VIEW_PERIOD_YEARS}
            value={viewPeriodDraft}
            onChange={(event) => handleViewPeriodDraftChange(event.target.value)}
            onBlur={commitViewPeriodDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitViewPeriodDraft();
            }}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-foreground"
          />
          Jahre
        </label>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-xs uppercase tracking-wide text-muted-foreground">{USE_CASE_GROUP_LABELS[group]}</span>
          {USE_CASES.filter((item) => item.group === group).map((item) => {
            const available = isAvailable(item);
            const active = available && selected.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                title={available ? item.question : `${item.question} (folgt)`}
                aria-pressed={active}
                disabled={!available}
                onClick={() => toggle(item.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : available
                      ? 'border-border text-foreground hover:bg-muted'
                      : 'cursor-not-allowed border-dashed border-border text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Wähle oben eine Auswertung aus.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => <Card key={card.id} card={card} />)}
        </div>
      )}
    </section>
  );
}
