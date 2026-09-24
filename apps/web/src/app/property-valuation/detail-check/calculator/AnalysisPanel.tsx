"use client";

import { Button, Dropdown, SectionLabel, Tag } from '@/components/ui';
import type { CalculatorMode, CalculatorParams } from '@/lib/detailCheck/rentCalculator';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { OPTIMIZATION_OBJECTIVE, USE_CASES, USE_CASE_GROUP_LABELS, isAvailable, type UseCase, type UseCaseGroup, type UseCaseId } from '@/lib/detailCheck/analysis/catalog';
import { buildAnalysisCards, formatCurrency, formatMonth, type AnalysisCard, type CardSeries } from '@/lib/detailCheck/analysis/cards';
import { measureDeltas, type RentCalculatorResult } from '@/lib/detailCheck/analysis/metrics';
import type { KeyFigures, OptimizationProposal } from '@/lib/detailCheck/analysis/optimize';
import type { ObjectiveId } from '@/lib/detailCheck/analysis/objectives';
import { useOptimization, type OptimizationState } from './useOptimization';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const duration = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Welche Kennzahlzeile je Ziel fett dargestellt wird (Step 1 der Aufgabe). */
const BOLD_ROW_BY_OBJECTIVE: Record<ObjectiveId, keyof KeyFigures> = {
  EARLIEST_BREAK_EVEN: 'breakEven',
  FASTEST_POSITIVE_CASHFLOW: 'sustainablyPositiveFrom',
  MAX_RENT_IN_VIEW: 'rentSumInView',
};

function OptimizationTable({ proposal, viewPeriodYears }: { proposal: OptimizationProposal; viewPeriodYears: number }) {
  // useOptimization only produces proposals for ObjectiveId goals (Schnitt 3 wiring); wiring the new
  // ROI/EK-Rendite/Empfehlung goals into this table is SCRUM-96 Schnitt 4 Task 4, not this cast.
  const boldKey = BOLD_ROW_BY_OBJECTIVE[proposal.goal as ObjectiveId];
  const rows: { key: keyof KeyFigures; label: string; format: (figures: KeyFigures) => string }[] = [
    { key: 'breakEven', label: 'Break-even', format: (f) => formatMonth(f.breakEven) },
    { key: 'sustainablyPositiveFrom', label: 'Cashflow dauerhaft positiv ab', format: (f) => formatMonth(f.sustainablyPositiveFrom) },
    { key: 'rentSumInView', label: `Mietsumme in ${viewPeriodYears} Jahren`, format: (f) => formatCurrency(f.rentSumInView) },
    { key: 'cashflowAtViewEnd', label: `Kumulierter Cashflow nach ${viewPeriodYears} Jahren`, format: (f) => formatCurrency(f.cashflowAtViewEnd) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 font-normal">Kennzahl</th>
            <th className="py-1.5 pr-2 text-right font-normal">Aktuell</th>
            <th className="py-1.5 text-right font-normal">Vorschlag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`border-t border-border ${row.key === boldKey ? 'font-semibold' : ''}`}>
              <td className="py-1.5 pr-2 text-muted-foreground">{row.label}</td>
              <td className="py-1.5 pr-2 text-right text-foreground">{row.format(proposal.before)}</td>
              <td className="py-1.5 text-right text-foreground">{row.format(proposal.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptimizationCard({
  useCase,
  mode,
  state,
  viewPeriodYears,
  onStart,
  onApplyPlacements,
}: {
  useCase: UseCase;
  mode: CalculatorMode;
  state: OptimizationState;
  viewPeriodYears: number;
  onStart: () => void;
  onApplyPlacements: (placements: Record<string, string>) => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">{useCase.label}</h3>
        {mode !== 'KNOWN' && <Tag label="Nur mit bekannten Maßnahmen" variant="muted" />}
        {mode === 'KNOWN' && state.status === 'error' && <Tag label="Fehler" variant="danger" />}
        {mode === 'KNOWN' && state.status === 'done' && state.proposal === null && <Tag label="Keine Maßnahme geplant" variant="muted" />}
        {mode === 'KNOWN' && state.status === 'done' && state.proposal !== null && (
          <Tag label={state.proposal.improved ? 'Verbesserung' : 'Plan ist bereits optimal'} variant={state.proposal.improved ? 'success' : 'muted'} />
        )}
      </div>

      {mode !== 'KNOWN' && (
        <p className="text-sm text-muted-foreground">Im Szenario Potenzial gibt es keine Zeitpunkte zu optimieren.</p>
      )}

      {mode === 'KNOWN' && state.status === 'running' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Rechnet … (ca. 5 Sekunden)
        </p>
      )}

      {mode === 'KNOWN' && state.status === 'error' && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button label="Erneut versuchen" variant="outline" icon={<Sparkles />} onClick={onStart} />
        </div>
      )}

      {mode === 'KNOWN' && state.status === 'done' && state.proposal && (
        <div className="space-y-3">
          <OptimizationTable proposal={state.proposal} viewPeriodYears={viewPeriodYears} />
          <p className="text-sm text-muted-foreground">
            {state.proposal.changes.length === 0
              ? 'Keine Verschiebung nötig.'
              : state.proposal.changes.map((change) => `${change.title}: ${formatMonth(change.from)} → ${formatMonth(change.to)}`).join('; ')}
          </p>
          {state.proposal.improved && state.proposal.changes.length > 0 && (
            <Button label="Übernehmen" variant="primary" onClick={() => onApplyPlacements(state.proposal!.placements)} />
          )}
          <p className="text-xs text-muted-foreground">Berechnet in {duration.format(state.durationMs / 1000)} s</p>
        </div>
      )}
    </article>
  );
}

const STORAGE_KEY = 'detail-check:analysis-use-cases';
const GOAL_STORAGE_KEY = 'detail-check:optimization-goal';
const DEFAULT_SELECTION: UseCaseId[] = ['break-even'];
const DEFAULT_GOAL: UseCaseId = 'optimaler-zeitpunkt';
const GROUPS: UseCaseGroup[] = ['auswertung', 'simulation'];
const MIN_VIEW_PERIOD_YEARS = 5;
const MAX_VIEW_PERIOD_YEARS = 50;

/** Anzeige-Labels für das Ziel-Dropdown (nur hier abweichend von den Katalog-Labels). */
const GOAL_DROPDOWN_LABELS: Partial<Record<UseCaseId, string>> = {
  'optimaler-zeitpunkt': 'Frühester Break-even',
  'mieterhoehungsstrategie': 'Höchste Mieteinnahmen im Betrachtungszeitraum',
  'cashflow-optimierung': 'Schnellster dauerhaft positiver Cashflow',
};

const OPTIMIZATION_USE_CASES = USE_CASES.filter((item) => item.group === 'optimierung');

function readSelection(): UseCaseId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is UseCaseId => USE_CASES.some((item) => item.id === id && item.group !== 'optimierung' && isAvailable(item)))
      : DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

function readGoal(): UseCaseId {
  try {
    const parsed = window.localStorage.getItem(GOAL_STORAGE_KEY);
    const match = OPTIMIZATION_USE_CASES.find((item) => item.id === parsed && isAvailable(item));
    return match ? match.id : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
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
  mode,
  onApplyPlacements,
}: {
  result: RentCalculatorResult;
  params: CalculatorParams;
  cases: RenovationCase[];
  viewPeriodYears: number;
  onViewPeriodYearsChange: (years: number) => void;
  mode: CalculatorMode;
  onApplyPlacements: (placements: Record<string, string>) => void;
}) {
  const [selected, setSelected] = useState<UseCaseId[]>(DEFAULT_SELECTION);
  useEffect(() => setSelected(readSelection()), []);

  const [goal, setGoal] = useState<UseCaseId>(DEFAULT_GOAL);
  useEffect(() => setGoal(readGoal()), []);

  const handleGoalChange = (id: UseCaseId) => {
    setGoal(id);
    try { window.localStorage.setItem(GOAL_STORAGE_KEY, id); } catch { /* ohne Speicher weiter */ }
  };

  const optimization = useOptimization(params, cases);

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

  const wirtschaftlichkeitSelected = selected.includes('wirtschaftlichkeit');

  // viewPeriodYears does not affect the calculator engine (it only changes how far the
  // existing result series is displayed), so it must not be part of the cache key below.
  // Without excluding it, ticking the Betrachtungszeitraum stepper would re-run
  // measureDeltas (n full calculator runs) on every keystroke even though nothing the
  // engine cares about changed.
  const engineKey = useMemo(() => JSON.stringify({ ...params, viewPeriodYears: undefined }), [params]);

  const cacheRef = useRef<{ key: string; cases: RenovationCase[]; value: ReturnType<typeof measureDeltas> } | null>(null);
  const measures = useMemo(() => {
    if (!wirtschaftlichkeitSelected) return undefined;
    const cached = cacheRef.current;
    if (cached && cached.key === engineKey && cached.cases === cases) {
      return cached.value;
    }
    const value = measureDeltas(result, params, cases);
    cacheRef.current = { key: engineKey, cases, value };
    return value;
  }, [engineKey, cases, wirtschaftlichkeitSelected, result, params]);

  const cards = useMemo(
    () => buildAnalysisCards({ selected, result, params, cases, viewPeriodYears, measures }),
    [selected, result, params, cases, viewPeriodYears, measures],
  );

  const goalUseCase = useMemo(
    () => OPTIMIZATION_USE_CASES.find((item) => item.id === goal) ?? OPTIMIZATION_USE_CASES[0],
    [goal],
  );
  const goalObjective = goalUseCase ? OPTIMIZATION_OBJECTIVE[goalUseCase.id] : undefined;
  const goalState = goalObjective ? optimization.stateFor(goalObjective) : { status: 'idle' as const };
  const optimizationRunning = goalState.status === 'running';

  const goalOptions = useMemo(
    () =>
      OPTIMIZATION_USE_CASES.map((item) => {
        const available = isAvailable(item);
        const label = GOAL_DROPDOWN_LABELS[item.id] ?? item.label;
        return { value: item.id, label: available ? label : `${label} (folgt)`, disabled: !available };
      }),
    [],
  );

  return (
    <section className="order-3 space-y-4">
      <div className="space-y-3">
        <SectionLabel>Optimieren</SectionLabel>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="w-full md:flex-1">
            <Dropdown
              label="Ziel"
              value={goal}
              onChange={(event) => handleGoalChange(event.target.value as UseCaseId)}
              options={goalOptions}
              helperText={goalUseCase?.question}
            />
          </div>
          <Button
            label="Optimieren"
            variant="primary"
            icon={<Sparkles />}
            onClick={() => goalObjective && optimization.start(goalObjective)}
            disabled={optimizationRunning || mode !== 'KNOWN'}
          />
        </div>
        {mode !== 'KNOWN' && (
          <p className="text-sm text-muted-foreground">Optimieren ist nur mit bekannten Maßnahmen möglich.</p>
        )}
        {goalUseCase && goalObjective && goalState.status !== 'idle' && (
          <OptimizationCard
            useCase={goalUseCase}
            mode={mode}
            state={goalState}
            viewPeriodYears={viewPeriodYears}
            onStart={() => optimization.start(goalObjective)}
            onApplyPlacements={onApplyPlacements}
          />
        )}
      </div>
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
