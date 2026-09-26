'use client';

import { useEffect, useState } from 'react';
import { propertyResourceRequest } from '@/lib/api/propertyResources';
import { getDocumentsByUser } from '@/lib/supabase/document.supabase';
import { getPropertiesOverview } from '@/lib/supabase/property.supabase';
import { getTaxExpenseDocumentsByUser } from '@/lib/supabase/tax_expense_document.supabase';
import { computeGrossYield } from '@/app/existing-properties/[propertyId]/key-metrics/keyMetricsCalculations';
import type { UserDocument } from '@immoandthebrain/types';
import { errorMessage } from '@/lib/api/apiError';

// ----------------------------------------------------------------------------
// Row shapes returned by the generic property-resources endpoint (snake_case
// on the wire) — mapped to the small subset of fields the dashboard needs.
// ----------------------------------------------------------------------------

interface FinancialsRow {
  propertyId: number;
  currentMarketValue: number | null;
  loanAmount: number | null;
  equity: number | null;
  interestRate: number | null;
  repaymentRate: number | null;
}

interface TenancyRow {
  propertyId: number;
  propertyUnitId: number | null;
  isRented: boolean | null;
  coldRent: number | null;
  tenancyEndDate: string | null;
  nextRentAdjustmentDate: string | null;
}

interface UnitRow {
  propertyId: number;
  propertyUnitId: number;
  targetColdRent: number | null;
}

interface MeasureRow {
  propertyId: number;
  renovationMeasureId: number;
  title: string;
  preferredStartDate: string | null;
  quotedStartDate: string | null;
  actualCompletionDate: string | null;
  published: boolean;
  quoteAccepted: boolean;
}

interface AdjustmentRow {
  propertyId: number;
  effectiveDate: string | null;
  amount: number | null;
}

function mapFinancials(row: Record<string, unknown>): FinancialsRow {
  return {
    propertyId: row.property_id as number,
    currentMarketValue: row.current_market_value == null ? null : Number(row.current_market_value),
    loanAmount: row.loan_amount == null ? null : Number(row.loan_amount),
    equity: row.equity == null ? null : Number(row.equity),
    interestRate: row.interest_rate == null ? null : Number(row.interest_rate),
    repaymentRate: row.repayment_rate == null ? null : Number(row.repayment_rate),
  };
}

function mapTenancy(row: Record<string, unknown>): TenancyRow {
  return {
    propertyId: row.property_id as number,
    propertyUnitId: row.property_unit_id == null ? null : Number(row.property_unit_id),
    isRented: row.is_rented as boolean | null,
    coldRent: row.cold_rent == null ? null : Number(row.cold_rent),
    tenancyEndDate: row.tenancy_end_date as string | null,
    nextRentAdjustmentDate: row.next_rent_adjustment_date as string | null,
  };
}

function mapUnit(row: Record<string, unknown>): UnitRow {
  return {
    propertyId: row.property_id as number,
    propertyUnitId: row.property_unit_id as number,
    targetColdRent: row.target_cold_rent == null ? null : Number(row.target_cold_rent),
  };
}

function mapMeasure(row: Record<string, unknown>): MeasureRow {
  return {
    propertyId: row.property_id as number,
    renovationMeasureId: row.renovation_measure_id as number,
    title: row.title as string,
    preferredStartDate: row.preferred_start_date as string | null,
    quotedStartDate: row.quoted_start_date as string | null,
    actualCompletionDate: row.actual_completion_date as string | null,
    published: row.published as boolean,
    quoteAccepted: row.quote_accepted as boolean,
  };
}

function mapAdjustment(row: Record<string, unknown>): AdjustmentRow {
  return {
    propertyId: row.property_id as number,
    effectiveDate: row.effective_date as string | null,
    amount: row.amount == null ? null : Number(row.amount),
  };
}

// ----------------------------------------------------------------------------
// Public shapes consumed by the dashboard page
// ----------------------------------------------------------------------------

export type PropertyRowStatus = 'vermietet' | 'leerstand' | 'auszug';

export interface DashboardPropertyRow {
  propertyId: number;
  address: string;
  city: string;
  occupiedUnits: number;
  totalUnits: number;
  monthlyRent: number;
  status: PropertyRowStatus;
  statusLabel: string;
}

export interface DashboardTask {
  id: string;
  label: string;
  sublabel: string;
  dueLabel: string;
  urgency: 'today' | 'soon' | 'open';
  href: string;
}

export interface DashboardHint {
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export interface DashboardRecentItem {
  id: string;
  label: string;
  sublabel: string;
  timestamp: string;
  href: string;
}

export interface DashboardRecentDocument {
  id: string;
  name: string;
  fileName: string;
  ok: boolean;
  href: string;
}

/** One property's share of a given tax year's receipts — the breakdown
 *  shown when a DashboardTaxYearSummary row is expanded. */
export interface DashboardTaxYearProperty {
  propertyId: number;
  label: string;
  documentCount: number;
  totalAmount: number;
}

/** All Steuerunterlagen receipts across every property, for one calendar
 *  year (grouped by the receipt's upload date) — backs the dashboard's
 *  "Steuerunterlagen nach Jahr" overview. */
export interface DashboardTaxYearSummary {
  year: number;
  propertyCount: number;
  documentCount: number;
  totalAmount: number;
  properties: DashboardTaxYearProperty[];
}

export interface DashboardKpis {
  immobilienwerte: number;
  mieteinnahmen: number;
  renditePercent: number;
  vermietungsquotePercent: number;
  vacantUnitsCount: number;
  mietDeltaText: string | null;
}

export interface DashboardFinanzstatus {
  immobilienwerte: number;
  renditePercent: number;
  mieteinnahmen: number;
  eigenkapitalquotePercent: number;
  zinsausgabenProJahr: number;
  tilgungProJahr: number;
  cashFlowProJahr: number;
}

export interface DashboardData {
  isLoading: boolean;
  error: string | null;
  kpis: DashboardKpis;
  finanzstatus: DashboardFinanzstatus;
  properties: DashboardPropertyRow[];
  tasks: DashboardTask[];
  hints: DashboardHint[];
  recentItems: DashboardRecentItem[];
  recentDocuments: DashboardRecentDocument[];
  taxDocumentsByYear: DashboardTaxYearSummary[];
}

const EMPTY_KPIS: DashboardKpis = {
  immobilienwerte: 0,
  mieteinnahmen: 0,
  renditePercent: 0,
  vermietungsquotePercent: 0,
  vacantUnitsCount: 0,
  mietDeltaText: null,
};

const EMPTY_FINANZSTATUS: DashboardFinanzstatus = {
  immobilienwerte: 0,
  renditePercent: 0,
  mieteinnahmen: 0,
  eigenkapitalquotePercent: 0,
  zinsausgabenProJahr: 0,
  tilgungProJahr: 0,
  cashFlowProJahr: 0,
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dueLabelFor(days: number): { label: string; urgency: DashboardTask['urgency'] } {
  if (days <= 0) return { label: 'Heute', urgency: 'today' };
  return { label: `in ${days} Tag${days === 1 ? '' : 'en'}`, urgency: 'soon' };
}

export function useDashboardData(userId: string | undefined): DashboardData {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis>(EMPTY_KPIS);
  const [finanzstatus, setFinanzstatus] = useState<DashboardFinanzstatus>(EMPTY_FINANZSTATUS);
  const [propertyRows, setPropertyRows] = useState<DashboardPropertyRow[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [hints, setHints] = useState<DashboardHint[]>([]);
  const [recentItems, setRecentItems] = useState<DashboardRecentItem[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<DashboardRecentDocument[]>([]);
  const [taxDocumentsByYear, setTaxDocumentsByYear] = useState<DashboardTaxYearSummary[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [
          propertiesOverview,
          financialsRaw,
          tenancyRaw,
          unitsRaw,
          measuresRaw,
          adjustmentsRaw,
          documents,
          taxExpenseDocs,
        ] = await Promise.all([
          getPropertiesOverview(userId!),
          propertyResourceRequest<Record<string, unknown>[]>('property-financials', {}, {}),
          propertyResourceRequest<Record<string, unknown>[]>('tenancies', {}, { current: true }),
          propertyResourceRequest<Record<string, unknown>[]>('property-units', {}, {}),
          propertyResourceRequest<Record<string, unknown>[]>('renovation-measures', {}, {}),
          propertyResourceRequest<Record<string, unknown>[]>('tenancy-adjustment-history', {}, {}),
          getDocumentsByUser(userId!),
          getTaxExpenseDocumentsByUser(),
        ]);
        if (cancelled) return;

        const financials = (financialsRaw ?? []).map(mapFinancials);
        const tenancies = (tenancyRaw ?? []).map(mapTenancy).filter((t) => t.isRented !== false);
        const units = (unitsRaw ?? []).map(mapUnit);
        const measures = (measuresRaw ?? []).map(mapMeasure);
        const adjustments = (adjustmentsRaw ?? []).map(mapAdjustment);

        const financialsByProperty = new Map(financials.map((f) => [f.propertyId, f]));
        const activeProperties = propertiesOverview.filter((p) => !p.archivedAt);
        const propertyById = new Map(activeProperties.map((p) => [p.propertyId, p]));

        // ---- Steuerunterlagen nach Jahr ---------------------------------
        // Every receipt uploaded anywhere under Steuerunterlagen, across all
        // properties, grouped by the calendar year it was uploaded in.
        const taxYearMap = new Map<number, Map<number, DashboardTaxYearProperty>>();
        for (const doc of taxExpenseDocs) {
          const property = propertyById.get(doc.propertyId);
          if (!property) continue;
          const year = new Date(doc.createdAt).getFullYear();
          if (!taxYearMap.has(year)) taxYearMap.set(year, new Map());
          const propertiesForYear = taxYearMap.get(year)!;
          const existing = propertiesForYear.get(doc.propertyId);
          if (existing) {
            existing.documentCount += 1;
            existing.totalAmount += doc.amount;
          } else {
            propertiesForYear.set(doc.propertyId, {
              propertyId: doc.propertyId,
              label: `${property.street} ${property.houseNumber}`,
              documentCount: 1,
              totalAmount: doc.amount,
            });
          }
        }
        const taxYearSummaries: DashboardTaxYearSummary[] = Array.from(taxYearMap.entries())
          .map(([year, propertiesForYear]) => {
            const propertyRows = Array.from(propertiesForYear.values()).sort((a, b) => a.label.localeCompare(b.label));
            return {
              year,
              propertyCount: propertyRows.length,
              documentCount: propertyRows.reduce((sum, p) => sum + p.documentCount, 0),
              totalAmount: propertyRows.reduce((sum, p) => sum + p.totalAmount, 0),
              properties: propertyRows,
            };
          })
          .sort((a, b) => b.year - a.year);
        setTaxDocumentsByYear(taxYearSummaries);

        // ---- Portfolio-wide totals -------------------------------------
        let immobilienwerte = 0;
        let zinsausgabenProJahr = 0;
        let tilgungProJahr = 0;
        let equitySum = 0;
        for (const property of activeProperties) {
          const fin = financialsByProperty.get(property.propertyId);
          const value = fin?.currentMarketValue ?? property.purchasePrice ?? 0;
          immobilienwerte += value;
          if (fin?.loanAmount) {
            zinsausgabenProJahr += fin.loanAmount * ((fin.interestRate ?? 0) / 100);
            tilgungProJahr += fin.loanAmount * ((fin.repaymentRate ?? 0) / 100);
          }
          if (fin?.equity) equitySum += fin.equity;
        }

        let mieteinnahmen = 0;
        for (const t of tenancies) {
          if (!propertyById.has(t.propertyId)) continue;
          mieteinnahmen += t.coldRent ?? 0;
        }

        const renditePercent = computeGrossYield(mieteinnahmen * 12, immobilienwerte);
        const eigenkapitalquotePercent = immobilienwerte > 0 ? Math.round((equitySum / immobilienwerte) * 1000) / 10 : 0;
        const cashFlowProJahr = Math.round(mieteinnahmen * 12 - zinsausgabenProJahr - tilgungProJahr);

        const totalUnits = units.filter((u) => propertyById.has(u.propertyId)).length;
        const tenantedUnitIds = new Set(tenancies.map((t) => t.propertyUnitId).filter((id): id is number => id != null));
        const vacantUnitsCount = Math.max(0, totalUnits - tenantedUnitIds.size);
        const vermietungsquotePercent = totalUnits > 0 ? Math.round(((totalUnits - vacantUnitsCount) / totalUnits) * 1000) / 10 : 0;

        // "seit letzter Anpassung" — most recent real rent adjustment, if any.
        const latestAdjustment = adjustments
          .filter((a) => a.effectiveDate && a.amount)
          .sort((a, b) => new Date(b.effectiveDate!).getTime() - new Date(a.effectiveDate!).getTime())[0];
        const mietDeltaText = latestAdjustment
          ? `${latestAdjustment.amount! > 0 ? '+' : ''}${Math.round(latestAdjustment.amount!)} € seit letzter Anpassung`
          : null;

        setKpis({ immobilienwerte, mieteinnahmen, renditePercent, vermietungsquotePercent, vacantUnitsCount, mietDeltaText });
        setFinanzstatus({ immobilienwerte, renditePercent, mieteinnahmen, eigenkapitalquotePercent, zinsausgabenProJahr: Math.round(zinsausgabenProJahr), tilgungProJahr: Math.round(tilgungProJahr), cashFlowProJahr });

        // ---- Bestandsobjekte rows --------------------------------------
        const unitsByProperty = new Map<number, UnitRow[]>();
        for (const u of units) {
          if (!unitsByProperty.has(u.propertyId)) unitsByProperty.set(u.propertyId, []);
          unitsByProperty.get(u.propertyId)!.push(u);
        }
        const tenanciesByProperty = new Map<number, TenancyRow[]>();
        for (const t of tenancies) {
          if (!tenanciesByProperty.has(t.propertyId)) tenanciesByProperty.set(t.propertyId, []);
          tenanciesByProperty.get(t.propertyId)!.push(t);
        }

        const rows: DashboardPropertyRow[] = activeProperties.map((property) => {
          const propUnits = unitsByProperty.get(property.propertyId) ?? [];
          const propTenancies = tenanciesByProperty.get(property.propertyId) ?? [];
          const occupiedUnits = propTenancies.filter((t) => t.propertyUnitId != null).length;
          const totalPropertyUnits = propUnits.length || property.numberOfUnits || 1;
          const monthlyRent = propTenancies.reduce((sum, t) => sum + (t.coldRent ?? 0), 0);
          const movingOut = propTenancies.some((t) => t.tenancyEndDate && daysUntil(t.tenancyEndDate) >= 0);
          const vacant = totalPropertyUnits - occupiedUnits;

          let status: PropertyRowStatus = 'vermietet';
          let statusLabel = 'Vermietet';
          if (movingOut) {
            status = 'auszug';
            statusLabel = 'Auszug geplant';
          } else if (vacant > 0) {
            status = 'leerstand';
            statusLabel = vacant === 1 ? '1 Leerstand' : `${vacant} Leerstand`;
          }

          return {
            propertyId: property.propertyId,
            address: `${property.street} ${property.houseNumber}`,
            city: `${property.postalCode} ${property.city}`,
            occupiedUnits,
            totalUnits: totalPropertyUnits,
            monthlyRent,
            status,
            statusLabel,
          };
        });
        setPropertyRows(rows);

        // ---- Aufgaben (real, derived signals only) ---------------------
        const propertyLabel = (propertyId: number) => {
          const p = propertyById.get(propertyId);
          return p ? `${p.street} ${p.houseNumber}` : '';
        };

        const derivedTasks: DashboardTask[] = [];
        for (const m of measures) {
          if (m.actualCompletionDate || !propertyById.has(m.propertyId)) continue;
          const startDate = m.quotedStartDate ?? m.preferredStartDate;
          if (!m.published) {
            derivedTasks.push({
              id: `measure-open-${m.renovationMeasureId}`,
              label: `Handwerker: ${m.title}`,
              sublabel: propertyLabel(m.propertyId),
              dueLabel: 'Offen',
              urgency: 'open',
              href: `/existing-properties/${m.propertyId}/contractors`,
            });
          } else if (startDate) {
            const days = daysUntil(startDate);
            if (days >= 0 && days <= 30) {
              const { label, urgency } = dueLabelFor(days);
              derivedTasks.push({
                id: `measure-start-${m.renovationMeasureId}`,
                label: `Handwerker: ${m.title}`,
                sublabel: propertyLabel(m.propertyId),
                dueLabel: label,
                urgency,
                href: `/existing-properties/${m.propertyId}/contractors`,
              });
            }
          }
        }
        for (const t of tenancies) {
          if (!propertyById.has(t.propertyId)) continue;
          if (t.nextRentAdjustmentDate) {
            const days = daysUntil(t.nextRentAdjustmentDate);
            if (days >= 0 && days <= 30) {
              const { label, urgency } = dueLabelFor(days);
              derivedTasks.push({
                id: `rent-adjustment-${t.propertyId}-${t.propertyUnitId}`,
                label: 'Mietanpassung prüfen',
                sublabel: propertyLabel(t.propertyId),
                dueLabel: label,
                urgency,
                href: `/existing-properties/${t.propertyId}/rental-trends`,
              });
            }
          }
          if (t.tenancyEndDate) {
            const days = daysUntil(t.tenancyEndDate);
            if (days >= 0 && days <= 60) {
              const { label, urgency } = dueLabelFor(days);
              derivedTasks.push({
                id: `move-out-${t.propertyId}-${t.propertyUnitId}`,
                label: 'Mieter zieht aus',
                sublabel: propertyLabel(t.propertyId),
                dueLabel: label,
                urgency,
                href: `/existing-properties/${t.propertyId}/tenant-move-out`,
              });
            }
          }
        }
        derivedTasks.sort((a, b) => {
          const rank = { today: 0, soon: 1, open: 2 } as const;
          return rank[a.urgency] - rank[b.urgency];
        });
        setTasks(derivedTasks.slice(0, 6));

        // ---- KI-Hinweise (real, derived signals only) ------------------
        const derivedHints: DashboardHint[] = [];
        for (const u of units) {
          if (!propertyById.has(u.propertyId) || u.targetColdRent == null) continue;
          const tenancy = tenancies.find((t) => t.propertyUnitId === u.propertyUnitId);
          if (!tenancy || tenancy.coldRent == null) continue;
          const gap = u.targetColdRent - tenancy.coldRent;
          if (gap > 0) {
            derivedHints.push({
              id: `potential-${u.propertyUnitId}`,
              label: 'Mietpotential nicht ausgeschöpft',
              sublabel: `${propertyLabel(u.propertyId)} · +${Math.round(gap)} € Monat möglich`,
              href: `/existing-properties/${u.propertyId}/rental-trends`,
            });
          }
        }
        for (const doc of documents) {
          if (doc.category !== 'Persönlich' || !doc.documentDate) continue;
          const ageMonths = (Date.now() - new Date(doc.documentDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
          if (ageMonths >= 3) {
            derivedHints.push({
              id: `stale-doc-${doc.documentId}`,
              label: `${doc.name} veraltet`,
              sublabel: `Dokument von ${new Date(doc.documentDate).getFullYear()}`,
              href: '/documents',
            });
          }
        }
        for (const m of measures) {
          if (m.actualCompletionDate || m.quoteAccepted || !m.preferredStartDate || !propertyById.has(m.propertyId)) continue;
          if (daysUntil(m.preferredStartDate) < 0) {
            derivedHints.push({
              id: `overdue-measure-${m.renovationMeasureId}`,
              label: 'Sanierung optimieren',
              sublabel: `${m.title}, ${propertyLabel(m.propertyId)}`,
              href: `/existing-properties/${m.propertyId}/contractors`,
            });
          }
        }
        setHints(derivedHints.slice(0, 4));

        // ---- Zuletzt bearbeitet -----------------------------------------
        const recents: DashboardRecentItem[] = [
          ...activeProperties.map((p) => ({
            id: `property-${p.propertyId}`,
            label: `${p.street} ${p.houseNumber}`,
            sublabel: 'Objektdaten',
            timestamp: p.updatedAt,
            href: `/existing-properties/${p.propertyId}`,
          })),
          ...measures.filter((m) => propertyById.has(m.propertyId)).map((m) => ({
            id: `measure-${m.renovationMeasureId}`,
            label: m.title,
            sublabel: propertyLabel(m.propertyId),
            timestamp: m.actualCompletionDate ?? m.quotedStartDate ?? m.preferredStartDate ?? '',
            href: `/existing-properties/${m.propertyId}/contractors`,
          })).filter((r) => r.timestamp),
          ...documents.map((d) => ({
            id: `document-${d.documentId}`,
            label: d.name,
            sublabel: 'Dokument',
            timestamp: d.updatedAt,
            href: '/documents',
          })),
        ]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 5);
        setRecentItems(recents);

        // ---- Letzte Dokumente --------------------------------------------
        const recentDocs: DashboardRecentDocument[] = [...documents]
          .sort((a: UserDocument, b: UserDocument) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 4)
          .map((d) => {
            const ageMonths = d.documentDate
              ? (Date.now() - new Date(d.documentDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
              : null;
            return {
              id: `doc-${d.documentId}`,
              name: d.name,
              fileName: d.fileName,
              ok: ageMonths == null ? true : ageMonths < 3,
              href: '/documents',
            };
          });
        setRecentDocuments(recentDocs);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Die Übersicht konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [userId]);

  return { isLoading, error, kpis, finanzstatus, properties: propertyRows, tasks, hints, recentItems, recentDocuments, taxDocumentsByYear };
}
