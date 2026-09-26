"use client";

import { PriceIndicationHint } from '@/components/features/PriceIndicationHint';
import { PriceRangeSlider } from '@/components/features/PriceRangeSlider';
import { RenovationMeasurePicker } from '@/components/features/RenovationMeasurePicker';
import { SaveStatusIndicator } from '@/components/features/SaveStatusIndicator';
import { Button, Checkbox, ConfirmDeleteModal, Dropdown, Icons, LoadingScreen, SectionLabel, StatTile, StickyActionBar, Table, Tag, TextArea, TextField, type TableColumn, ErrorAlert } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authFetch } from '@/lib/api/authFetch';
import { formatDecimalInput, parseDecimalInput } from '@/lib/detailCheck/acquisitionCosts';
import {
  aggregateRenovationPricing,
  costForCase,
  distributeTotalAcrossCases,
  evaluateRenovationCases,
  sumSelectedCosts,
  withDefaultSelectedCosts,
  type RenovationCase,
  type RenovationFinancingMode,
  type RenovationTiming,
} from '@/lib/detailCheck/renovation';
import { detailCheckWorkflowId } from '@/lib/detailCheck/workflow';
import { categoryLabel, indicatePriceRange, type RenovationCategory } from '@/lib/renovation/catalog';
import { getDocumentsByUser, getDocumentUrl, uploadDocument } from '@/lib/supabase/document.supabase';
import { cn, deNumberFormatter, formatEuro } from '@/lib/utils';
import type { UserDocument } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PropertyValuationLayout } from '../PropertyValuationLayout';
import { errorMessage, readApiError } from '@/lib/api/apiError';

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

const FINANCING_OPTIONS: { value: RenovationFinancingMode; label: string }[] = [
  { value: 'FREMD', label: 'Fremdfinanziert' },
  { value: 'EIGEN', label: 'Eigen finanziert' },
  { value: 'TEILWEISE', label: 'Teilweise' },
];

const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';

/** Pause after the last change before it is saved automatically. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * Everything a save persists, as a comparable string: autosave runs whenever
 * it differs from the last saved one. The server derives the financed amount
 * itself except for TEILWEISE, so only that mode's amount counts as a change.
 */
function saveSnapshot(cases: RenovationCase[], mode: RenovationFinancingMode, financedAmount: number): string {
  return JSON.stringify({ cases, mode, financedAmount: mode === 'TEILWEISE' ? financedAmount : 0 });
}

function idForCase() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  /** Signed URLs of Belege already opened in this visit. */
  const [documentUrls, setDocumentUrls] = useState<Record<number, string | null>>({});
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
  /** Set while the panel edits an existing case instead of adding one. */
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [casePendingDelete, setCasePendingDelete] = useState<RenovationCase | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  /** "Auswertung & Planung" and the price choice stay hidden — even
   *  for a workflow that already has saved (evaluated) cases — until an
   *  Auswertung is run in this visit ("Auswertung prüfen & anpassen" or
   *  the bar's "Weiter zur Auswertung"). */
  const [isEvaluationVisible, setIsEvaluationVisible] = useState(false);
  const evaluationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Snapshot (see saveSnapshot) of what the server holds; null until loaded. */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  /** A snapshot whose autosave failed — not retried until something changes again. */
  const [failedSnapshot, setFailedSnapshot] = useState<string | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/detail-check/renovation${suffix}`, { cache: 'no-store' });
        if (!res.ok) throw await readApiError(res);
        const data = await res.json() as RenovationResponse;
        if (cancelled) return;
        const loadedCases = withDefaultSelectedCosts(data.cases);
        const loadedFinancedAmount = formatDecimalInput(String(data.financing.financedAmount || ''));
        setCases(loadedCases);
        setContext(data.context);
        setFinancingMode(data.financing.mode);
        setFinancedAmount(loadedFinancedAmount);
        setSavedSnapshot(saveSnapshot(loadedCases, data.financing.mode, parseDecimalInput(loadedFinancedAmount)));
        if (data.cases.length > 0) setStage('PRICING');
        setIsFormOpen(data.cases.length === 0);
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError, 'Sanierung konnte nicht geladen werden.'));
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

    // Belege are listed as links, so no signed URLs are fetched up front —
    // openUpload resolves one on click.
    getDocumentsByUser(user.id).then((documents) => {
      setDocumentsById(Object.fromEntries(documents.map((document) => [document.documentId, document])));
    });
  }, [user]);

  const totals = useMemo(() => aggregateRenovationPricing(cases), [cases]);

  // Derived, never stored. The per-measure amounts in `cases` are the single
  // source of truth. Previously this was its own state that an effect clamped
  // into the current min/max whenever a measure was ticked or unticked — a
  // lossy write that destroyed the entered figure: unticking clamped it down,
  // re-ticking could not bring it back because the original was already gone.
  const sumSelected = useMemo(() => sumSelectedCosts(cases), [cases]);

  // Live indication for the Maßnahme chosen in the form — the same pricing
  // the case gets once it is added (evaluateRenovationCases).
  const formPriceRange = category && measure
    ? indicatePriceRange(category, measure, context ?? {})
    : null;

  const snapshot = useMemo(
    () => saveSnapshot(cases, financingMode, parseDecimalInput(financedAmount)),
    [cases, financingMode, financedAmount],
  );
  const isDirty = savedSnapshot !== null && snapshot !== savedSnapshot;

  // Request body of every save — the automatic one below and the explicit
  // one behind "Auswertung prüfen & anpassen" / "Weiter".
  const saveBody = useMemo(() => JSON.stringify({
    quickCheckId,
    workflowId,
    cases,
    pricing: { sum_selected: sumSelected || totals.sum_mid },
    financing: {
      mode: financingMode,
      financedAmount: parseDecimalInput(financedAmount),
    },
  }), [quickCheckId, workflowId, cases, sumSelected, totals.sum_mid, financingMode, financedAmount]);

  // Autosave: every added, edited or deleted Modernisierung (and every price,
  // timing or financing change) is persisted shortly after the last edit, so
  // nothing is lost when the page is left without "Weiter". Only one save
  // runs at a time; a change made during it is picked up once it finishes.
  useEffect(() => {
    if (isLoading || isSaving || isAutosaving || !isDirty || snapshot === failedSnapshot) return;
    const timer = setTimeout(async () => {
      setIsAutosaving(true);
      try {
        const res = await authFetch('/api/detail-check/renovation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: saveBody,
        });
        if (!res.ok) throw await readApiError(res);
        setSavedSnapshot(snapshot);
        setFailedSnapshot(null);
      } catch {
        setFailedSnapshot(snapshot);
        setError('Die Änderungen konnten nicht automatisch gespeichert werden. Sie werden beim nächsten Speichern erneut übertragen.');
      } finally {
        setIsAutosaving(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoading, isSaving, isAutosaving, isDirty, snapshot, failedSnapshot, saveBody]);

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
          // Links it to this detail check — with or without an Ersteinschätzung.
          detailCheckWorkflowId: detailCheckWorkflowId(quickCheckId, workflowId),
          documentDate: format(new Date(), 'yyyy-MM-dd'),
        });
        if (error) {
          setUploadFilesError(error);
          break;
        }
        if (uploaded) {
          setUploadNames((prev) => [...prev.filter((name) => name !== `local:${file.name}`), `document:${uploaded.documentId}`]);
          setDocumentsById((prev) => ({ ...prev, [uploaded.documentId]: uploaded }));
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

    const existingUrl = documentUrls[documentId];
    if (existingUrl) {
      window.open(existingUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const url = await getDocumentUrl(document.storagePath);
    setDocumentUrls((prev) => ({ ...prev, [documentId]: url }));
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const uploadLabel = (reference: string) => {
    if (!reference.startsWith('document:')) return reference.replace(/^local:/, '');
    return documentsById[Number(reference.slice('document:'.length))]?.fileName ?? 'Datei';
  };

  const closeForm = () => {
    resetForm();
    setEditingCaseId(null);
    setIsFormOpen(false);
  };

  const startEdit = (item: RenovationCase) => {
    setCategory(item.kategorie);
    setMeasure(item.massnahme);
    setDescription(item.beschreibung ?? '');
    setUploadNames(item.uploads ?? []);
    setUploadFilesError(null);
    setEditingCaseId(item.id);
    setIsFormOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const confirmDeleteCase = () => {
    if (!casePendingDelete) return;
    if (casePendingDelete.id === editingCaseId) closeForm();
    setCases((prev) => prev.filter((current) => current.id !== casePendingDelete.id));
    setCasePendingDelete(null);
  };

  const saveCase = () => {
    if (!category || !measure) {
      setError('Bitte wählen Sie Kategorie und Maßnahme aus.');
      return;
    }
    setError(null);

    if (editingCaseId) {
      setCases((prev) => prev.map((item) => {
        if (item.id !== editingCaseId) return item;
        const edited = { ...item, kategorie: category, massnahme: measure, beschreibung: description.trim(), uploads: uploadNames };
        // Same measure: keep its price and the amount set for it. A different
        // measure is a different price range, so it is re-priced from scratch.
        if (item.kategorie === category && item.massnahme === measure) return edited;
        const [repriced] = withDefaultSelectedCosts(evaluateRenovationCases({
          cases: [{ ...edited, cost_selected: undefined }],
          regionFactor: context?.regionFactor,
          livingAreaM2: context?.livingAreaM2,
        }));
        return repriced;
      }));
      closeForm();
      return;
    }

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
        body: saveBody,
      });
      if (!res.ok) throw await readApiError(res);
      const data = await res.json() as RenovationResponse;
      const savedCases = withDefaultSelectedCosts(data.cases);
      const savedFinancedAmount = formatDecimalInput(String(data.financing.financedAmount || ''));
      setCases(savedCases);
      setFinancingMode(data.financing.mode);
      setFinancedAmount(savedFinancedAmount);
      setSavedSnapshot(saveSnapshot(savedCases, data.financing.mode, parseDecimalInput(savedFinancedAmount)));
      setFailedSnapshot(null);
      setStage('PRICING');
      setIsEvaluationVisible(true);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError, 'Sanierung konnte nicht ausgewertet werden.'));
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
      if (!res.ok) throw await readApiError(res);
      setSavedSnapshot(saveSnapshot([], 'FREMD', 0));
      if (navigate) router.push(`/property-valuation/detail-check/calculator${suffix}`);
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError, 'Sanierung konnte nicht übersprungen werden.'));
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
      : `${formatEuro(parseDecimalInput(financedAmount))} fremdfinanziert`;

  const casesRows: CaseRow[] = cases.map((item) => ({ key: item.id, item }));

  /** Belege as file links; `onRemove` adds a remove button per file (form only). */
  const renderUploads = (uploads: string[] | undefined, onRemove?: (reference: string) => void) => (
    uploads?.length ? (
      <ul className="flex flex-col gap-1">
        {uploads.map((reference) => {
          const documentId = reference.startsWith('document:') ? Number(reference.slice('document:'.length)) : 0;
          const document = documentsById[documentId];
          const FileIcon = document?.contentType?.startsWith('image/') ? Icons.Image : Icons.FileText;
          return (
            <li key={reference} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void openUpload(reference)}
                disabled={!document}
                title={document ? `${document.fileName} öffnen` : `${uploadLabel(reference)} (wird hochgeladen)`}
                className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-sm text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{uploadLabel(reference)}</span>
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(reference)}
                  aria-label={`${uploadLabel(reference)} entfernen`}
                  className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Icons.X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    ) : <span className="text-muted-foreground">–</span>
  );

  const casesColumns: TableColumn<CaseRow>[] = [
    {
      key: 'actions',
      label: 'Aktion',
      width: '80px',
      renderCell: (_v, row) => (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<Icons.MoreVertical />}
          aria-label={`Aktionen für ${row.item.massnahme}`}
          menuItems={[
            { label: 'Bearbeiten', icon: <Icons.Rename />, onClick: () => startEdit(row.item) },
            { label: 'Löschen', icon: <Icons.Trash2 />, destructive: true, onClick: () => setCasePendingDelete(row.item) },
          ]}
        />
      ),
    },
    { key: 'kategorie', label: 'Kategorie', width: '150px', renderCell: (_v, row) => <Tag label={categoryLabel(row.item.kategorie)} variant="info" /> },
    {
      key: 'massnahme',
      label: 'Maßnahme',
      width: '22%',
      renderCell: (_v, row) => <span className="block whitespace-normal break-words font-medium">{row.item.massnahme}</span>,
    },
    {
      key: 'beschreibung',
      label: 'Beschreibung',
      // The table cell clips to one line by default; the description is
      // free text of any length, so it wraps and is always shown in full.
      renderCell: (_v, row) => (
        <span className="block whitespace-pre-line break-words text-muted-foreground">{row.item.beschreibung || '–'}</span>
      ),
    },
    { key: 'uploads', label: 'Belege', width: '22%', renderCell: (_v, row) => renderUploads(row.item.uploads) },
  ];

  const allSelected = cases.length > 0 && cases.every((item) => item.selected);

  // One table for both the price indication and the planning (Zeitpunkt,
  // Auftrag): every captured case, with a checkbox deciding whether it counts
  // towards the total. Unticked cases stay visible (dimmed) and keep their
  // amount, so re-ticking restores it.
  const planningColumns: TableColumn<CaseRow>[] = [
    {
      key: 'selected',
      label: 'Auswahl',
      header: (
        <Checkbox
          checked={allSelected}
          onChange={(event) => setCases((prev) => prev.map((item) => ({ ...item, selected: event.target.checked })))}
          aria-label={allSelected ? 'Alle Maßnahmen abwählen' : 'Alle Maßnahmen auswählen'}
        />
      ),
      width: '56px',
      renderCell: (_v, row) => (
        <Checkbox
          checked={row.item.selected}
          onChange={(event) => updateCase(row.item.id, { selected: event.target.checked })}
          aria-label={`${row.item.massnahme} auswählen`}
        />
      ),
    },
    {
      key: 'massnahme',
      label: 'Maßnahme',
      renderCell: (_v, row) => (
        <>
          <span className="block whitespace-normal break-words font-semibold">{row.item.massnahme}</span>
          <span className="block text-xs text-muted-foreground">{categoryLabel(row.item.kategorie)}</span>
        </>
      ),
    },
    {
      key: 'indikation',
      label: 'KI-Indikation',
      width: '170px',
      renderCell: (_v, row) => row.item.ai ? (
        <span title={row.item.ai.summary}>
          <span className="text-muted-foreground">{deNumberFormatter.format(row.item.ai.price_min)} – </span>
          <span className="font-semibold text-primary">{formatEuro(row.item.ai.price_max)}</span>
        </span>
      ) : <span className="text-muted-foreground">–</span>,
    },
    {
      key: 'angesetzt',
      label: 'Angesetzt (€)',
      width: '170px',
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
    {
      key: 'zeitpunkt',
      label: 'Zeitpunkt',
      width: '150px',
      renderCell: (_v, row) => (
        <Dropdown
          aria-label={`${row.item.massnahme} Zeitpunkt`}
          value={row.item.zeitpunkt}
          disabled={!row.item.selected}
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
      label: 'Auftrag',
      width: '90px',
      align: 'center',
      renderCell: (_v, row) => (
        <span className="inline-flex justify-center" title="Im Handwerker-Netzwerk ausschreiben">
          <Checkbox
            checked={row.item.publish_order}
            disabled={!row.item.selected}
            onChange={(event) => updateCase(row.item.id, { publish_order: event.target.checked })}
            aria-label={`${row.item.massnahme} im Handwerker-Netzwerk ausschreiben`}
          />
        </span>
      ),
    },
  ];

  // Table footer: the total of the ticked cases and how it is financed.
  const planningFooter = (
    <span className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-foreground">
      <span className="font-medium">
        Gesamtsumme: <span className="text-base font-semibold text-primary">{formatEuro(sumSelected)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Finanzierung:</span>
        <span className="w-52">
          <Dropdown
            aria-label="Finanzierung"
            value={financingMode}
            onChange={(event) => setFinancingMode(event.target.value as RenovationFinancingMode)}
            options={FINANCING_OPTIONS}
          />
        </span>
        {financingMode === 'TEILWEISE' && (
          <span className="w-44">
            <TextField
              value={financedAmount}
              onChange={(event) => setFinancedAmount(event.target.value)}
              inputMode="decimal"
              suffix="€"
              placeholder="Fremdkapitalanteil"
              aria-label="Fremdfinanzierter Anteil"
              title="Der verbleibende Betrag wird als Eigenkapital behandelt."
            />
          </span>
        )}
      </span>
    </span>
  );


  return (
    <PropertyValuationLayout
      currentStep={5}
      title="Sanierungskosten"
      beforeStepChange={persistCurrent}
      showFieldLegend
      actions={isLoading ? undefined : <SaveStatusIndicator isSaving={isSaving || isAutosaving} isDirty={isDirty} />}
    >
      <div className="pb-24">
        {error && <ErrorAlert message={error} className="mb-4" />}

        {isLoading ? (
          <LoadingScreen message="Sanierung wird geladen…" fullScreen={false} />
        ) : (
          <div className="flex flex-col gap-8">
            {/* ── Übersicht ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Modernisierungen" value={cases.length} caption="erfasst" />
              <StatTile
                label="Angesetzte Kosten"
                value={stage === 'PRICING' ? formatEuro(sumSelected) : '–'}
                valueClassName="text-primary"
                caption={stage === 'PRICING' ? 'nach Auswertung' : 'nach Auswertung verfügbar'}
              />
              <StatTile
                label="Ausgewählt"
                value={`${selectedCases.length} / ${cases.length}`}
                valueClassName={selectedCases.length > 0 ? 'text-success' : undefined}
                caption="für Kalkulation"
              />
              <StatTile label="Finanzierung" value={financingLabel} caption={financingCaption} captionClassName="text-accent-text" />
            </div>

            {/* ── Erfasste Modernisierungen ─────────────────────────────── */}
            <section className="flex flex-col gap-3">
              <SectionLabel>Erfasste Modernisierungen</SectionLabel>
              <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    label="Auswertung prüfen & anpassen"
                    icon={isSaving ? <Icons.Loader2 className="animate-spin" /> : <Icons.BarChart3 />}
                    disabled={cases.length === 0 || isLoading || isSaving}
                    onClick={() => void openEvaluation()}
                  />
                  {/* Only while the form is closed — once open, it's closed by
                      the ✕ in its own header, right where the form is. */}
                  {!isFormOpen && (
                    <Button
                      variant="outline"
                      size="sm"
                      label="Modernisierung hinzufügen"
                      icon={<Icons.Plus />}
                      aria-controls="renovation-form"
                      onClick={() => setIsFormOpen(true)}
                    />
                  )}
              </div>

              {isFormOpen && (
                <div id="renovation-form" ref={formRef} className="scroll-mt-24 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {editingCaseId
                        ? <Icons.Rename className="h-4 w-4 text-primary" aria-hidden="true" />
                        : <Icons.Plus className="h-4 w-4 text-primary" aria-hidden="true" />}
                      {editingCaseId ? 'Modernisierung bearbeiten' : 'Neue Modernisierung'}
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      iconOnly
                      icon={<Icons.X />}
                      aria-label="Formular schließen"
                      onClick={closeForm}
                    />
                  </div>

                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    <RenovationMeasurePicker
                      category={category}
                      measure={measure}
                      onCategoryChange={setCategory}
                      onMeasureChange={setMeasure}
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
                          <div className="mt-3">
                            {renderUploads(uploadNames, (reference) => setUploadNames((prev) => prev.filter((name) => name !== reference)))}
                          </div>
                        )}
                        {uploadFilesError && <p className="mt-2 text-xs text-destructive">{uploadFilesError}</p>}
                      </div>
                    </div>

                    {formPriceRange && (
                      <div className="md:col-span-2">
                        <PriceIndicationHint range={formPriceRange} />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                    {editingCaseId
                      ? <Button variant="outline" size="sm" label={BUTTON_DETAILS.Cancel.label} icon={<Icons.X />} onClick={closeForm} />
                      : <Button variant="outline" size="sm" label="Zurücksetzen" icon={<Icons.RotateCcw />} onClick={resetForm} />}
                    <Button
                      variant="outline"
                      size="sm"
                      label={editingCaseId ? 'Übernehmen' : 'Hinzufügen'}
                      icon={editingCaseId ? <Icons.Check /> : <Icons.Plus />}
                      disabled={!category || !measure || isUploadingFiles}
                      onClick={saveCase}
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
                {/* ── Auswertung & Planung ────────────────────────────────── */}
                <section className="flex flex-col gap-3">
                  <SectionLabel>Auswertung & Planung</SectionLabel>
                  <Table
                    columns={planningColumns}
                    data={casesRows}
                    emptyMessage="Noch keine Modernisierungen erfasst."
                    footerLeft={planningFooter}
                    getRowClassName={(row) => (row.item.selected ? undefined : 'opacity-60')}
                  />
                </section>

                {/* ── Preiswahl ───────────────────────────────────────────── */}
                <section className="flex flex-col gap-3">
                  <SectionLabel>Mit welchem Preis möchtest du weiterrechnen?</SectionLabel>
                  <PriceRangeSlider
                    min={totals.sum_min}
                    max={totals.sum_max}
                    value={sumSelected}
                    onChange={(value) => setCases((prev) => distributeTotalAcrossCases(prev, value))}
                    format={formatEuro}
                    hint="Dieser Wert fließt in die Renditeberechnung ein."
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
        loading={isSaving}
        onPrimary={stage === 'ENTRY'
          ? (cases.length === 0 ? () => void continueWithoutRenovations(true) : evaluateCases)
          : saveAndNext}
      />

      <ConfirmDeleteModal
        open={casePendingDelete !== null}
        onCancel={() => setCasePendingDelete(null)}
        onConfirm={confirmDeleteCase}
        title="Modernisierung löschen?"
      >
        <p className="text-sm text-muted-foreground">
          {casePendingDelete ? `„${casePendingDelete.massnahme}“ wird aus der Detailbewertung entfernt.` : ''}
        </p>
      </ConfirmDeleteModal>
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
