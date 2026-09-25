"use client";

import { Button, Dropdown, Icons, LoadingScreen, ReadOnlyField, SectionLabel, StickyActionBar, Table, TextArea, TextField, type TableColumn } from '@/components/ui';
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
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';

interface CaseRow extends Record<string, unknown> {
  key: string;
  item: RenovationCase;
}

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

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return `${currencyFormatter.format(value)} €`;
}

function idForCase() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function measureOptions(category: RenovationCategory | '') {
  return [
    { value: '', label: 'Bitte wählen...' },
    ...((category ? RENOVATION_MEASURES[category] : []) ?? []).map((measure) => ({
      value: measure,
      label: measure,
    })),
  ];
}

function ReadOnlyPill({ value }: { value: string }) {
  return <ReadOnlyField value={value} align="right" emphasis />;
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
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Sanierung konnte nicht ausgewertet werden.');
      return false;
    } finally {
      setIsSaving(false);
    }
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

  const casesRows: CaseRow[] = cases.map((item) => ({ key: item.id, item }));
  const selectedRows: CaseRow[] = selectedCases.map((item) => ({ key: item.id, item }));

  const casesColumns: TableColumn<CaseRow>[] = [
    { key: 'kategorie', label: 'Kategorie', renderCell: (_v, row) => categoryLabel(row.item.kategorie) },
    { key: 'massnahme', label: 'Maßnahme', renderCell: (_v, row) => row.item.massnahme },
    { key: 'beschreibung', label: 'Beschreibung', renderCell: (_v, row) => <span className="text-muted-foreground">{row.item.beschreibung || '-'}</span> },
    {
      key: 'uploads',
      label: 'Bilder und Unterlagen',
      renderCell: (_v, row) => (
        row.item.uploads?.length ? (
          <div className="flex flex-wrap gap-2">
            {row.item.uploads.map((reference) => {
              const documentId = reference.startsWith('document:') ? Number(reference.slice('document:'.length)) : 0;
              const document = documentsById[documentId];
              const previewUrl = previewUrls[documentId];
              return (
                <button
                  key={reference}
                  type="button"
                  onClick={() => void openUpload(reference)}
                  disabled={!document}
                  className="group flex max-w-48 items-center gap-2 rounded-md border border-border bg-card p-1.5 text-left text-xs hover:border-primary disabled:cursor-default"
                  title={document ? `${document.fileName} öffnen` : uploadLabel(reference)}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="h-10 w-12 rounded object-cover" />
                  ) : document?.contentType?.startsWith('image/') ? (
                    <div className="flex h-10 w-12 items-center justify-center rounded bg-muted">
                      <Icons.AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                  ) : (
                    <Icons.FileText className="w-[18px] h-[18px]" />
                  )}
                  <span className="min-w-0 truncate">{uploadLabel(reference)}</span>
                  {document && <Icons.Eye className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />}
                </button>
              );
            })}
          </div>
        ) : '-'
      ),
    },
    {
      key: 'actions',
      label: 'Aktion',
      renderCell: (_v, row) => (
        <button
          type="button"
          className="text-sm text-destructive cursor-pointer"
          onClick={() => setCases((prev) => prev.filter((current) => current.id !== row.item.id))}
        >
          Entfernen
        </button>
      ),
    },
  ];

  const pricingColumns: TableColumn<CaseRow>[] = [
    {
      key: 'selected',
      label: 'Auswahl',
      width: '80px',
      renderCell: (_v, row) => (
        <input
          type="checkbox"
          checked={row.item.selected}
          onChange={(event) => updateCase(row.item.id, { selected: event.target.checked })}
          aria-label={`${row.item.massnahme} auswählen`}
        />
      ),
    },
    { key: 'massnahme', label: 'Maßnahme', renderCell: (_v, row) => <span className="font-medium text-foreground">{row.item.massnahme}</span> },
    { key: 'indikation', label: 'Indikation', renderCell: (_v, row) => <span className="text-muted-foreground">{row.item.ai?.summary ?? '-'}</span> },
    { key: 'von', label: 'Von', align: 'right', renderCell: (_v, row) => formatCurrency(row.item.ai?.price_min ?? 0) },
    { key: 'bis', label: 'Bis', align: 'right', renderCell: (_v, row) => formatCurrency(row.item.ai?.price_max ?? 0) },
    {
      key: 'angesetzt',
      label: 'Angesetzt',
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

  const summaryColumns: TableColumn<CaseRow>[] = [
    {
      key: 'massnahme',
      label: 'Maßnahme',
      renderCell: (_v, row) => (
        <>
          <div className="font-medium">{row.item.massnahme}</div>
          <div className="text-xs text-muted-foreground">{categoryLabel(row.item.kategorie)}</div>
        </>
      ),
    },
    {
      key: 'kosten',
      label: 'Kosten',
      align: 'right',
      renderCell: (_v, row) => (
        <>
          <div>{formatCurrency(costForCase(row.item))}</div>
          <div className="text-xs font-normal text-muted-foreground">In der Preisindikation angesetzt</div>
        </>
      ),
    },
    {
      key: 'zeitpunkt',
      label: 'Zeitpunkt',
      renderCell: (_v, row) => (
        <Dropdown
          aria-label={`${row.item.massnahme} Zeitpunkt`}
          value={row.item.zeitpunkt}
          onChange={(event) => updateCase(row.item.id, { zeitpunkt: event.target.value as RenovationTiming })}
          options={[
            { value: 'SOFORT', label: 'Sofort' },
            { value: 'FLEXIBEL', label: 'Flexibel' },
          ]}
        />
      ),
    },
    {
      key: 'publish',
      label: 'Auftrag veröffentlichen',
      renderCell: (_v, row) => (
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.item.publish_order}
            onChange={(event) => updateCase(row.item.id, { publish_order: event.target.checked })}
          />
          Ja
        </label>
      ),
    },
  ];

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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <SectionLabel>Übersicht</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Modernisierungen</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{cases.length}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Kostenspanne</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{stage === 'PRICING' ? `${formatCurrency(totals.sum_min)} – ${formatCurrency(totals.sum_max)}` : '–'}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ausgewählt</p>
                  <p className="mt-2 text-2xl font-semibold text-primary">{stage === 'PRICING' ? formatCurrency(sumSelected) : '–'}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Finanzierung</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {financingMode === 'FREMD' ? 'Fremdfinanziert' : financingMode === 'EIGEN' ? 'Eigen finanziert' : 'Teilweise'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Aufnahme der Modernisierungen</SectionLabel>

              <div className="grid gap-4 pt-1 md:grid-cols-2">
                <Dropdown
                  label="Kategorie"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value as RenovationCategory);
                    setMeasure('');
                  }}
                  options={[
                    { value: '', label: 'Bitte wählen...' },
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
                <TextArea
                  label="Beschreibung"
                  optional
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1500}
                  helperText="Optional: Schaden oder Modernisierungswunsch beschreiben. Bilder und Text können kombiniert werden."
                />
                <div className="rounded-lg border border-dashed border-border bg-card px-4 py-3">
                    <div className="mb-3 flex items-start gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icons.Upload className="w-[18px] h-[18px]" /></span>
                      <div>
                        <h3 className="font-medium text-foreground">Bilder und Unterlagen hochladen</h3>
                        <p className="text-xs text-muted-foreground">Exposé, Besichtigungsfotos oder vorhandene Kostendokumente</p>
                      </div>
                    </div>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    disabled={!user || isUploadingFiles}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setUploadNames(files.map((file) => `local:${file.name}`));
                      void handleUploadRenovationFiles(files);
                    }}
                    className="block w-full text-sm text-muted-foreground disabled:opacity-50"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Dateien werden gespeichert und erscheinen auf der Dokumente-Seite. Die Preisindikation verwendet derzeit Kategorie, Wohnfläche und PLZ; eine KI-Bildauswertung ist noch nicht angebunden.
                  </p>
                  {uploadNames.length > 0 && <p className="mt-2 text-xs font-medium text-primary">Ausgewählt: {uploadNames.map(uploadLabel).join(', ')}</p>}
                  {isUploadingFiles && <p className="mt-1 text-xs text-muted-foreground">Lädt hoch…</p>}
                  {uploadFilesError && <p className="mt-1 text-xs text-destructive">{uploadFilesError}</p>}
                </div>
                <div className="flex items-end justify-start md:col-start-2 md:justify-end">
                  <Button label="Modernisierung hinzufügen" icon={<Icons.Plus className="w-4 h-4" />} onClick={addCase} />
                </div>
              </div>

              <div className="mt-6">
                <Table
                  columns={casesColumns}
                  data={casesRows}
                  emptyMessage="Noch keine Modernisierungen erfasst."
                  footerLeft={`${cases.length} Einträge`}
                />
              </div>
            </div>

            {stage === 'PRICING' && (
              <>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Preisindikation</SectionLabel>
                  <Table
                    columns={pricingColumns}
                    data={casesRows}
                    emptyMessage="Noch keine Modernisierungen erfasst."
                    footerLeft={`${cases.length} Einträge`}
                  />

                  <div className="mt-6 max-w-3xl">
                    <p className="mb-3 text-lg font-medium">Mit welchem Preis wollen Sie weiterrechnen?</p>
                    <div className="grid gap-3 md:grid-cols-[130px_1fr_130px] md:items-center">
                      <ReadOnlyPill value={formatCurrency(totals.sum_min)} />
                      <input
                        type="range"
                        min={totals.sum_min}
                        max={Math.max(totals.sum_max, totals.sum_min)}
                        step="100"
                        value={Math.max(totals.sum_min, Math.min(totals.sum_max, sumSelected))}
                        disabled={totals.sum_max <= totals.sum_min}
                        onChange={(event) => setCases((prev) => distributeTotalAcrossCases(prev, Number(event.target.value)))}
                        aria-label="Preis für weitere Berechnung"
                      />
                      <ReadOnlyPill value={formatCurrency(totals.sum_max)} />
                    </div>
                    <div className="mt-3 max-w-xs">
                      <ReadOnlyPill value={`Ausgewählt: ${formatCurrency(sumSelected)}`} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <SectionLabel>Zusammenfassung</SectionLabel>
                  <Table
                    columns={summaryColumns}
                    data={selectedRows}
                    emptyMessage="Keine Modernisierungen ausgewählt."
                    footerLeft={`${selectedCases.length} Einträge`}
                    footerRight={`Gesamtsumme: ${formatCurrency(sumSelected)}`}
                  />
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Gesamtsumme</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(sumSelected)}</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_minmax(0,220px)]">
                        <Dropdown
                          label="Finanzierung"
                          value={financingMode}
                          onChange={(event) => setFinancingMode(event.target.value as RenovationFinancingMode)}
                          options={[
                            { value: 'FREMD', label: 'Fremdfinanziert' },
                            { value: 'EIGEN', label: 'Eigen finanziert' },
                            { value: 'TEILWEISE', label: 'Teilweise' },
                          ]}
                        />
                        {financingMode === 'TEILWEISE' && (
                          <TextField
                            label="Fremdkapitalanteil"
                            optional
                            value={financedAmount}
                            onChange={(event) => setFinancedAmount(event.target.value)}
                            inputMode="decimal"
                            suffix="€"
                            aria-label="Fremdfinanzierter Anteil"
                            helperText="Der verbleibende Betrag wird als Eigenkapital behandelt."
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Preisindikation aktuell per lokaler Fallback-Logik mit PLZ-Faktor{context?.postalCode ? ` (${context.postalCode})` : ''}; die KI- und Upload-Auswertung ist als nächster Integrationspunkt vorbereitet.
                  </p>
                </div>
              </>
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
