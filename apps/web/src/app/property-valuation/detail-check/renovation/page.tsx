"use client";

import { Button, Checkbox, Dropdown, Icons, LoadingScreen, SectionLabel, StickyActionBar, Table, Tag, TextArea, TextField, type TableColumn } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authFetch } from '@/lib/api/authFetch';
import { formatDecimalInput, parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import {
  aggregateRenovationPricing,
  categoryLabel,
  costForCase,
  distributeTotalAcrossCases,
  evaluateRenovationCases,
  sumSelectedCosts,
  withDefaultSelectedCosts,
  RENOVATION_CATEGORIES,
  RENOVATION_MEASURES,
  type RenovationCase,
  type RenovationCategory,
  type RenovationFinancingMode,
  type RenovationTiming,
} from '@/lib/detailCheck/renovation';
import { getDocumentsByUser, getDocumentUrl, uploadDocument } from '@/lib/supabase/document.supabase';
import type { UserDocument } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

interface CaseRow extends Record<string, unknown> {
  key: string;
  item: RenovationCase;
}

/** Summary table row: a selected case, or the trailing Gesamtsumme row. */
type SummaryRow = CaseRow | { key: 'total'; item: null };

type Stage = 'ENTRY' | 'PRICING';

type RenovationResponse = {
  cases: RenovationCase[];
  pricing: {
    sum_min: number;
    sum_max: number;
    sum_mid: number;
    sum_selected: number;
  };
  financing: {
    mode: RenovationFinancingMode;
    financedAmount: number;
  };
  context: {
    postalCode: string;
    /** Resolved server-side from the renovation_region_factor table. */
    regionFactor: number;
    livingAreaM2: number;
  };
};

// Whole euros unless an entered amount actually has cents.
const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const FINANCING_OPTIONS: { value: RenovationFinancingMode; label: string }[] = [
  { value: 'FREMD', label: 'Fremdfinanziert' },
  { value: 'EIGEN', label: 'Eigen finanziert' },
  { value: 'TEILWEISE', label: 'Teilweise' },
];

const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';

function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)} €`;
}

function idForCase() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function measureOptions(category: RenovationCategory | '') {
  return [
    { value: '', label: category ? 'Bitte wählen…' : 'Erst Kategorie wählen…' },
    ...((category ? RENOVATION_MEASURES[category] : []) ?? []).map((measure) => ({
      value: measure,
      label: measure,
    })),
  ];
}

function StatCell({ label, value, caption, valueClassName, captionClassName }: {
  label: string;
  value: ReactNode;
  caption: string;
  valueClassName?: string;
  captionClassName?: string;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 truncate text-xl font-semibold text-foreground', valueClassName)}>{value}</p>
      <p className={cn('mt-0.5 text-xs text-muted-foreground', captionClassName)}>{caption}</p>
    </div>
  );
}

/** The fixed ends of the price slider — read-only, hence the lock. */
function BoundBox({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {caption}
        <Icons.Lock className="h-3 w-3" aria-hidden="true" />
      </p>
    </div>
  );
}

function RenovationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useRequireAuth();
  const quickCheckId = searchParams.get('quickCheckId');
  const workflowId = searchParams.get('workflowId');
  const suffix = quickCheckId ? `?quickCheckId=${encodeURIComponent(quickCheckId)}` : workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';

  const [stage, setStage] = useState<Stage>('ENTRY');
  const [cases, setCases] = useState<RenovationCase[]>([]);
  const [category, setCategory] = useState<RenovationCategory | ''>('');
  const [measure, setMeasure] = useState('');
  const [description, setDescription] = useState('');
  const [uploadNames, setUploadNames] = useState<string[]>([]);
  const [documentsById, setDocumentsById] = useState<Record<number, UserDocument>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<number, string | null>>({});
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadFilesError, setUploadFilesError] = useState<string | null>(null);
  const [financingMode, setFinancingMode] = useState<RenovationFinancingMode>('FREMD');
  const [financedAmount, setFinancedAmount] = useState('');
  const [context, setContext] = useState<RenovationResponse['context'] | null>(null);
  /** Raw text per measure while its amount field is being edited (id → input). */
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "Neue Modernisierung" panel — open by default only while nothing is captured yet. */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  /** Preisindikation, price choice and Zusammenfassung stay hidden — even
   *  for a workflow that already has saved (evaluated) cases — until an
   *  Auswertung is run in this visit ("Auswertung prüfen & anpassen" or
   *  the bar's "Weiter zur Auswertung"). */
  const [isEvaluationVisible, setIsEvaluationVisible] = useState(false);
  const evaluationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/renovation${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as RenovationResponse;
        if (cancelled) return;
        setCases(withDefaultSelectedCosts(data.cases));
        setContext(data.context);
        setFinancingMode(data.financing.mode);
        setFinancedAmount(formatDecimalInput(String(data.financing.financedAmount || '')));
        if (data.cases.length > 0) setStage('PRICING');
        setIsFormOpen(data.cases.length === 0);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Sanierung konnte nicht geladen werden.');
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
    if (!user) return;

    getDocumentsByUser(user.id).then(async (documents) => {
      setDocumentsById(Object.fromEntries(documents.map((document) => [document.documentId, document])));

      const imageDocuments = documents.filter((document) => document.contentType?.startsWith('image/'));
      if (imageDocuments.length === 0) {
        setPreviewUrls({});
        return;
      }

      const settled = await Promise.allSettled(
        imageDocuments.map(async (document) => {
          const url = await getDocumentUrl(document.storagePath);
          return [document.documentId, url] as const;
        }),
      );

      const previewMap = Object.fromEntries(
        settled
          .filter((result): result is PromiseFulfilledResult<readonly [number, string | null]> => result.status === 'fulfilled')
          .map((result) => result.value)
          .filter((entry): entry is readonly [number, string] => Boolean(entry[1]))
      );

      setPreviewUrls(previewMap);
    });
  }, [user]);

  const totals = useMemo(() => aggregateRenovationPricing(cases), [cases]);

  // Derived, never stored. The per-measure amounts in `cases` are the single
  // source of truth. Previously this was its own state that an effect clamped
  // into the current min/max whenever a measure was ticked or unticked — a
  // lossy write that destroyed the entered figure: unticking clamped it down,
  // re-ticking could not bring it back because the original was already gone.
  const sumSelected = useMemo(() => sumSelectedCosts(cases), [cases]);

  useEffect(() => {
    if (financingMode === 'FREMD') setFinancedAmount(formatDecimalInput(String(sumSelected)));
    if (financingMode === 'EIGEN') setFinancedAmount('');
  }, [financingMode, sumSelected]);

  const handleUploadRenovationFiles = async (files: File[]) => {
    if (!user || files.length === 0) return;
    setIsUploadingFiles(true);
    setUploadFilesError(null);
    try {
      for (const file of files) {
        const { document: uploaded, error } = await uploadDocument(user.id, file, {
          userId: user.id,
          category: 'Detailbewertung',
          name: file.name.replace(/\.[^/.]+$/, ''),
          propertyId: null,
          quickCheckId: quickCheckId ? Number(quickCheckId) : null,
          documentDate: format(new Date(), 'yyyy-MM-dd'),
        });
        if (error) {
          setUploadFilesError(error);
          break;
        }
        if (uploaded) {
          setUploadNames((prev) => [...prev.filter((name) => name !== `local:${file.name}`), `document:${uploaded.documentId}`]);
          setDocumentsById((prev) => ({ ...prev, [uploaded.documentId]: uploaded }));
          if (uploaded.contentType?.startsWith('image/')) {
            const url = await getDocumentUrl(uploaded.storagePath);
            if (url) setPreviewUrls((prev) => ({ ...prev, [uploaded.documentId]: url }));
          }
        }
      }
    } finally {
      setIsUploadingFiles(false);
    }
  };

  // Shared by the file picker and drag & drop.
  const selectFiles = (files: File[]) => {
    if (files.length === 0 || !user || isUploadingFiles) return;
    setUploadNames((prev) => [...prev, ...files.map((file) => `local:${file.name}`)]);
    void handleUploadRenovationFiles(files);
  };

  const resetForm = () => {
    setCategory('');
    setMeasure('');
    setDescription('');
    setUploadNames([]);
    setUploadFilesError(null);
  };

  const openUpload = async (reference: string) => {
    const documentId = Number(reference.replace(/^document:/, ''));
    const document = documentsById[documentId];
    if (!document) return;

    const existingUrl = previewUrls[documentId];
    if (existingUrl) {
      window.open(existingUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const url = await getDocumentUrl(document.storagePath);
    setPreviewUrls((prev) => ({ ...prev, [documentId]: url }));
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const uploadLabel = (reference: string) => {
    if (!reference.startsWith('document:')) return reference.replace(/^local:/, '');
    return documentsById[Number(reference.slice('document:'.length))]?.fileName ?? 'Datei';
  };

  const addCase = () => {
    if (!category || !measure) {
      setError('Bitte wählen Sie Kategorie und Maßnahme aus.');
      return;
    }
    setError(null);
    // Price the new case right away with the same pure function the API route
    // uses (evaluateRenovationCases in buildResponse). Without this the case
    // enters the list with no `ai` payload, and because the pricing table
    // falls back to `item.ai?.price_min ?? 0` it would read "0,00 € – 0,00 €"
    // until the next server round-trip. That round-trip only happens via the
    // primary action, which runs evaluateCases only while stage === 'ENTRY' —
    // so once a workflow already has a saved case (which puts the page into
    // stage PRICING on load), every further case stayed at 0 indefinitely.
    // The server re-evaluates all cases on save, so it stays authoritative.
    const [evaluated] = withDefaultSelectedCosts(evaluateRenovationCases({
      cases: [{
        id: idForCase(),
        kategorie: category,
        massnahme: measure,
        beschreibung: description.trim(),
        uploads: uploadNames,
        selected: true,
        zeitpunkt: 'SOFORT',
        publish_order: false,
      }],
      regionFactor: context?.regionFactor,
      livingAreaM2: context?.livingAreaM2,
    }));
    setCases((prev) => [...prev, evaluated]);
    setMeasure('');
    setDescription('');
    setUploadNames([]);
  };

  const evaluateCases = async () => {
    if (cases.length === 0) {
      setError('Bitte legen Sie mindestens eine Modernisierung an.');
      return false;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/renovation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          cases,
          pricing: { sum_selected: sumSelected || totals.sum_mid },
          financing: {
            mode: financingMode,
            financedAmount: parseDecimalInput(financedAmount),
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as RenovationResponse;
      setCases(withDefaultSelectedCosts(data.cases));
      setFinancingMode(data.financing.mode);
      setFinancedAmount(formatDecimalInput(String(data.financing.financedAmount || '')));
      setStage('PRICING');
      setIsEvaluationVisible(true);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Sanierung konnte nicht ausgewertet werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Saves + re-evaluates (so cases added since the last Auswertung get
  // priced), then reveals the evaluation sections and scrolls to them.
  const openEvaluation = async () => {
    if (!(await evaluateCases())) return;
    requestAnimationFrame(() => evaluationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const saveAndNext = async () => {
    const ok = await evaluateCases();
    if (ok && stage === 'PRICING') router.push(`/property-valuation/detail-check/calculator${suffix}`);
  };

  const continueWithoutRenovations = async (navigate = true): Promise<boolean> => {
    if (isSaving) return false;

    setIsSaving(true);
    setError(null);
    try {
      const res = await authFetch('/api/detail-check/renovation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickCheckId,
          workflowId,
          cases: [],
          pricing: { sum_selected: 0 },
          financing: { mode: 'FREMD', financedAmount: 0 },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (navigate) router.push(`/property-valuation/detail-check/calculator${suffix}`);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Sanierung konnte nicht übersprungen werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const persistCurrent = async (): Promise<boolean> => cases.length > 0
    ? evaluateCases()
    : continueWithoutRenovations(false);

  const handleBack = async () => {
    if (await persistCurrent()) router.push(`/property-valuation/detail-check/depreciation${suffix}`);
  };

  const updateCase = (id: string, patch: Partial<RenovationCase>) => {
    setCases((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  /**
   * Writes the typed amount back into the case and drops the draft, so the
   * field falls back to showing the canonical value again. Keeping the raw
   * text in a separate draft map while editing lets the user type "1.2" or
   * clear the field without the parsed value fighting the keystrokes.
   */
  const commitCostInput = (id: string) => {
    const draft = costInputs[id];
    if (draft !== undefined) {
      updateCase(id, { cost_selected: Math.max(0, parseDecimalInput(draft)) });
    }
    setCostInputs((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const selectedCases = cases.filter((item) => item.selected);
  const primaryLabel = stage === 'ENTRY' ? 'Weiter zur Auswertung' : 'Weiter';
  const financingLabel = FINANCING_OPTIONS.find((option) => option.value === financingMode)?.label ?? '–';
  const financingCaption = financingMode === 'FREMD'
    ? 'über Darlehen'
    : financingMode === 'EIGEN'
      ? 'aus Eigenkapital'
      : `${formatCurrency(parseDecimalInput(financedAmount))} fremdfinanziert`;

  const casesRows: CaseRow[] = cases.map((item) => ({ key: item.id, item }));
  const summaryRows: SummaryRow[] = [
    ...selectedCases.map((item) => ({ key: item.id, item })),
    ...(selectedCases.length > 0 ? [{ key: 'total' as const, item: null }] : []),
  ];

  const renderUploads = (uploads: string[] | undefined) => (
    uploads?.length ? (
      <div className="flex flex-wrap gap-1.5">
        {uploads.map((reference) => {
          const documentId = reference.startsWith('document:') ? Number(reference.slice('document:'.length)) : 0;
          const document = documentsById[documentId];
          const previewUrl = previewUrls[documentId];
          return (
            <button
              key={reference}
              type="button"
              onClick={() => void openUpload(reference)}
              disabled={!document}
              className="group flex max-w-40 items-center gap-1.5 rounded-md border border-border bg-card p-1 pr-2 text-left text-xs hover:border-primary disabled:cursor-default"
              title={document ? `${document.fileName} öffnen` : uploadLabel(reference)}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" className="h-7 w-8 rounded object-cover" />
              ) : (
                <span className="flex h-7 w-8 items-center justify-center rounded bg-muted">
                  <Icons.FileText className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0 truncate">{uploadLabel(reference)}</span>
            </button>
          );
        })}
      </div>
    ) : <span className="text-muted-foreground">–</span>
  );

  const casesColumns: TableColumn<CaseRow>[] = [
    {
      key: 'actions',
      label: 'Aktion',
      width: '80px',
      renderCell: (_v, row) => (
        <Button
          variant="outline"
          size="sm"
          iconOnly
          icon={<Icons.Trash2 />}
          aria-label={`${row.item.massnahme} entfernen`}
          className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => setCases((prev) => prev.filter((current) => current.id !== row.item.id))}
        />
      ),
    },
    { key: 'kategorie', label: 'Kategorie', width: '140px', renderCell: (_v, row) => <Tag label={categoryLabel(row.item.kategorie)} variant="info" /> },
    { key: 'massnahme', label: 'Maßnahme', renderCell: (_v, row) => <span className="font-medium">{row.item.massnahme}</span> },
    { key: 'beschreibung', label: 'Beschreibung', renderCell: (_v, row) => <span className="text-muted-foreground">{row.item.beschreibung || '–'}</span> },
    { key: 'uploads', label: 'Belege', renderCell: (_v, row) => renderUploads(row.item.uploads) },
  ];

  const pricingColumns: TableColumn<CaseRow>[] = [
    {
      key: 'selected',
      label: 'Auswahl',
      width: '90px',
      renderCell: (_v, row) => (
        <Checkbox
          checked={row.item.selected}
          onChange={(event) => updateCase(row.item.id, { selected: event.target.checked })}
          aria-label={`${row.item.massnahme} auswählen`}
        />
      ),
    },
    { key: 'massnahme', label: 'Maßnahme', renderCell: (_v, row) => <span className="font-medium">{row.item.massnahme}</span> },
    {
      key: 'indikation',
      label: 'KI-Indikation',
      renderCell: (_v, row) => <span className="block truncate text-muted-foreground" title={row.item.ai?.summary}>{row.item.ai?.summary ?? '–'}</span>,
    },
    { key: 'von', label: 'Von', align: 'right', width: '110px', renderCell: (_v, row) => <span className="text-muted-foreground">{formatCurrency(row.item.ai?.price_min ?? 0)}</span> },
    { key: 'bis', label: 'Bis', align: 'right', width: '110px', renderCell: (_v, row) => <span className="text-muted-foreground">{formatCurrency(row.item.ai?.price_max ?? 0)}</span> },
    {
      key: 'angesetzt',
      label: 'Angesetzt',
      align: 'right',
      width: '160px',
      renderCell: (_v, row) => (
        <TextField
          inputMode="decimal"
          suffix="€"
          className="text-right"
          aria-label={`Angesetzte Kosten für ${row.item.massnahme}`}
          disabled={!row.item.selected || !row.item.ai}
          value={costInputs[row.item.id] ?? formatDecimalInput(String(costForCase(row.item)))}
          onChange={(event) => setCostInputs((prev) => ({ ...prev, [row.item.id]: event.target.value }))}
          onBlur={() => commitCostInput(row.item.id)}
        />
      ),
    },
  ];

  const summaryColumns: TableColumn<SummaryRow>[] = [
    {
      key: 'massnahme',
      label: 'Maßnahme',
      renderCell: (_v, row) => row.item ? (
        <>
          <div className="font-medium">{row.item.massnahme}</div>
          <div className="text-xs text-muted-foreground">{categoryLabel(row.item.kategorie)}</div>
        </>
      ) : <span className="font-semibold">Gesamtsumme</span>,
    },
    {
      key: 'kosten',
      label: 'Kosten',
      align: 'right',
      width: '140px',
      renderCell: (_v, row) => row.item ? (
        <>
          <div className="font-medium">{formatCurrency(costForCase(row.item))}</div>
          <div className="text-xs text-muted-foreground">Angesetzt</div>
        </>
      ) : <span className="text-base font-semibold text-primary">{formatCurrency(sumSelected)}</span>,
    },
    {
      key: 'zeitpunkt',
      label: 'Zeitpunkt',
      width: '200px',
      renderCell: (_v, row) => row.item ? (
        <Dropdown
          aria-label={`${row.item.massnahme} Zeitpunkt`}
          value={row.item.zeitpunkt}
          onChange={(event) => row.item && updateCase(row.item.id, { zeitpunkt: event.target.value as RenovationTiming })}
          options={[
            { value: 'SOFORT', label: 'Sofort' },
            { value: 'FLEXIBEL', label: 'Flexibel' },
          ]}
        />
      ) : (
        <Dropdown
          aria-label="Finanzierung"
          value={financingMode}
          onChange={(event) => setFinancingMode(event.target.value as RenovationFinancingMode)}
          options={FINANCING_OPTIONS}
        />
      ),
    },
    {
      key: 'publish',
      label: 'Auftrag veröffentlichen',
      width: '230px',
      renderCell: (_v, row) => row.item ? (
        <Checkbox
          label="Im Handwerker-Netzwerk"
          checked={row.item.publish_order}
          onChange={(event) => row.item && updateCase(row.item.id, { publish_order: event.target.checked })}
        />
      ) : financingMode === 'TEILWEISE' ? (
        <TextField
          value={financedAmount}
          onChange={(event) => setFinancedAmount(event.target.value)}
          inputMode="decimal"
          suffix="€"
          placeholder="Fremdkapitalanteil"
          aria-label="Fremdfinanzierter Anteil"
          title="Der verbleibende Betrag wird als Eigenkapital behandelt."
        />
      ) : null,
    },
  ];

  const sliderMax = Math.max(totals.sum_max, totals.sum_min);

  return (
    <PropertyValuationLayout
      currentStep={5}
      title="Sanierungskosten"
      beforeStepChange={persistCurrent}
      showFieldLegend
    >
      <div className="pb-24">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingScreen message="Sanierung wird geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-8">
            {/* ── Übersicht ─────────────────────────────────────────────── */}
            {/* gap-px over a border-coloured background draws the dividers,
                for both the 2×2 (mobile) and 1×4 layout. */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <StatCell label="Modernisierungen" value={cases.length} caption="erfasst" />
              <StatCell
                label="Angesetzte Kosten"
                value={stage === 'PRICING' ? formatCurrency(sumSelected) : '–'}
                valueClassName="text-primary"
                caption={stage === 'PRICING' ? 'nach Auswertung' : 'nach Auswertung verfügbar'}
              />
              <StatCell
                label="Ausgewählt"
                value={`${selectedCases.length} / ${cases.length}`}
                valueClassName={selectedCases.length > 0 ? 'text-success' : undefined}
                caption="für Kalkulation"
              />
              <StatCell label="Finanzierung" value={financingLabel} caption={financingCaption} captionClassName="text-accent-text" />
            </div>

            {/* ── Erfasste Modernisierungen ─────────────────────────────── */}
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Erfasste Modernisierungen</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    label="Auswertung prüfen & anpassen"
                    icon={isSaving ? <Icons.Loader2 className="animate-spin" /> : <Icons.BarChart3 />}
                    disabled={cases.length === 0 || isLoading || isSaving}
                    onClick={() => void openEvaluation()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    label={isFormOpen ? 'Schließen' : 'Modernisierung hinzufügen'}
                    icon={isFormOpen ? <Icons.X /> : <Icons.Plus />}
                    aria-expanded={isFormOpen}
                    aria-controls="new-renovation-form"
                    onClick={() => setIsFormOpen((open) => !open)}
                  />
                </div>
              </div>

              {isFormOpen && (
                <div id="new-renovation-form" className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Icons.Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                      Neue Modernisierung
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      iconOnly
                      icon={<Icons.X />}
                      aria-label="Formular schließen"
                      onClick={() => setIsFormOpen(false)}
                    />
                  </div>

                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    <Dropdown
                      label="Kategorie"
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value as RenovationCategory);
                        setMeasure('');
                      }}
                      options={[
                        { value: '', label: 'Bitte wählen…' },
                        ...RENOVATION_CATEGORIES,
                      ]}
                    />
                    <Dropdown
                      label="Maßnahme"
                      value={measure}
                      onChange={(event) => setMeasure(event.target.value)}
                      disabled={!category}
                      options={measureOptions(category)}
                    />
                    <div className="md:col-span-2">
                      <TextArea
                        label="Beschreibung"
                        optional
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={1500}
                        rows={3}
                        placeholder="Schaden oder Modernisierungswunsch beschreiben. Bilder und Text können kombiniert werden."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <p className="mb-2 text-sm font-medium text-foreground">
                        Bilder & Unterlagen <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <div
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsDraggingFiles(true);
                        }}
                        onDragLeave={() => setIsDraggingFiles(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setIsDraggingFiles(false);
                          selectFiles(Array.from(event.dataTransfer.files));
                        }}
                        className={cn(
                          'rounded-lg border-2 border-dashed px-4 py-4 transition-colors',
                          isDraggingFiles ? 'border-primary bg-primary/5' : 'border-border bg-background',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icons.Image className="h-[18px] w-[18px]" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Bilder und Unterlagen hochladen</p>
                            <p className="text-xs text-muted-foreground">Exposé, Besichtigungsfotos, Kostendokumente · PNG, JPG, PDF</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            label="Datei auswählen"
                            icon={isUploadingFiles ? <Icons.Loader2 className="animate-spin" /> : <Icons.Upload />}
                            disabled={!user || isUploadingFiles}
                            onClick={() => fileInputRef.current?.click()}
                          />
                          <span className="text-xs text-muted-foreground">oder hierher ziehen</span>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={UPLOAD_ACCEPT}
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden="true"
                            onChange={(event) => {
                              selectFiles(Array.from(event.target.files ?? []));
                              event.target.value = '';
                            }}
                          />
                        </div>
                        {uploadNames.length > 0 && (
                          <div className="mt-3">{renderUploads(uploadNames)}</div>
                        )}
                        {uploadFilesError && <p className="mt-2 text-xs text-destructive">{uploadFilesError}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                    <Button variant="outline" size="sm" label="Zurücksetzen" icon={<Icons.X />} onClick={resetForm} />
                    <Button
                      variant="outline"
                      size="sm"
                      label="Hinzufügen"
                      icon={<Icons.Plus />}
                      disabled={!category || !measure || isUploadingFiles}
                      onClick={addCase}
                    />
                  </div>
                </div>
              )}

              <Table
                columns={casesColumns}
                data={casesRows}
                emptyMessage="Noch keine Modernisierungen erfasst."
                footerLeft={`${cases.length} ${cases.length === 1 ? 'Eintrag' : 'Einträge'}`}
              />
            </section>

            {stage === 'PRICING' && isEvaluationVisible && (
              <div ref={evaluationRef} className="flex scroll-mt-24 flex-col gap-8">
                {/* ── Preisindikation ─────────────────────────────────────── */}
                <section className="flex flex-col gap-3">
                  <SectionLabel>Preisindikation</SectionLabel>
                  <Table
                    columns={pricingColumns}
                    data={casesRows}
                    emptyMessage="Noch keine Modernisierungen erfasst."
                    showFooter={false}
                  />
                </section>

                <section className="flex flex-col gap-3">
                  <SectionLabel>Mit welchem Preis weiterrechnen?</SectionLabel>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[120px_1fr_120px]">
                      <div className="order-1"><BoundBox value={formatCurrency(totals.sum_min)} caption="Minimum" /></div>
                      <input
                        type="range"
                        min={totals.sum_min}
                        max={sliderMax}
                        step="100"
                        value={Math.max(totals.sum_min, Math.min(totals.sum_max, sumSelected))}
                        disabled={totals.sum_max <= totals.sum_min}
                        onChange={(event) => setCases((prev) => distributeTotalAcrossCases(prev, Number(event.target.value)))}
                        aria-label="Preis für weitere Berechnung"
                        className="order-3 col-span-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed sm:order-2 sm:col-span-1"
                      />
                      <div className="order-2 sm:order-3"><BoundBox value={formatCurrency(totals.sum_max)} caption="Maximum" /></div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
                        <Icons.Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium text-foreground">Ausgewählt:</span>
                        <span className="font-semibold text-primary">{formatCurrency(sumSelected)}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">Dieser Wert fließt in die Renditeberechnung ein.</span>
                    </div>
                  </div>
                </section>

                {/* ── Zusammenfassung ─────────────────────────────────────── */}
                <section className="flex flex-col gap-3">
                  <SectionLabel>Zusammenfassung</SectionLabel>
                  <Table
                    columns={summaryColumns}
                    data={summaryRows}
                    emptyMessage="Keine Modernisierungen ausgewählt."
                    showFooter={false}
                    getRowClassName={(row) => (row.item ? undefined : 'bg-primary/5')}
                  />
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Icons.Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Preisindikation aktuell per lokaler Fallback-Logik mit PLZ-Faktor{context?.postalCode ? ` (${context.postalCode})` : ''}; die KI- und Upload-Auswertung ist als nächster Integrationspunkt vorbereitet.
                    </span>
                  </p>
                </section>
              </div>
            )}
          </div>
        )}
      </div>

      <StickyActionBar
        show
        ghostLabel={BUTTON_DETAILS.Back.label}
        ghostIcon={<BUTTON_DETAILS.Back.icon />}
        onGhost={() => void handleBack()}
        secondaryLabel={BUTTON_DETAILS.Skip.label}
        secondaryIcon={<BUTTON_DETAILS.Skip.icon />}
        secondaryDisabled={isLoading || isSaving || cases.length > 0}
        onSecondary={() => void continueWithoutRenovations(true)}
        primaryLabel={primaryLabel}
        primaryIcon={<BUTTON_DETAILS.Next.icon />}
        primaryDisabled={isLoading || isSaving}
        onPrimary={stage === 'ENTRY'
          ? (cases.length === 0 ? () => void continueWithoutRenovations(true) : evaluateCases)
          : saveAndNext}
      />
    </PropertyValuationLayout>
  );
}

export default function RenovationPage() {
  return (
    <Suspense fallback={null}>
      <RenovationContent />
    </Suspense>
  );
}
