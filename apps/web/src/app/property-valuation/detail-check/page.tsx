"use client";

import { NoResult } from '@/components/common';
import type { MenuItem, SortDirection, TableColumn } from '@/components/ui';
import { Button, ConfirmDeleteModal, Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, Table, Tag, TextFieldWithIcon } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authFetch } from '@/lib/api/authFetch';
import { createAcquisitionCosts } from '@/lib/supabase/acquisition_costs.supabase';
import { createParkingSpace } from '@/lib/supabase/parking_space.supabase';
import { createProperty } from '@/lib/supabase/property.supabase';
import { cn } from '@/lib/utils';
import type { EnergyEfficient } from '@immonext/types';
import { MoreVertical, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Each step after "property-data" is saved to its own table once the user
// clicks "Weiter" on it — the furthest one with a row is where they paused.
const STEP_ROUTES = [
  'property-data',
  'acquisition-costs',
  'leasing-or-rentals',
  'financing',
  'depreciation',
  'renovation',
  'calculator',
  'macro-location',
  'comparison',
];

interface DetailCheckRow extends Record<string, unknown> {
  workflowId: string;
  quickCheckId: number | null;
  address: string;
  postalCode: string;
  city: string;
  constructionYear: number;
  livingAreaM2: number;
  purchasePrice: number;
  propertyCategory: string | null;
  parkingSpaces: number;
  energyEfficiency: string | null;
  status: 'Abgeschlossen' | 'In Bearbeitung' | 'Nicht begonnen';
  updatedAt: string;
  /** Whether any step beyond property-data has been saved. */
  resumed: boolean;
  /** Route to jump back into: property-data if never progressed further,
   *  otherwise the step right after the furthest one completed ("result"
   *  once every step up to Vergleich is done). */
  resumeRoute: string;
}

// "Nicht begonnen" stays the actual status value (used for sorting/filtering
// and elsewhere in this file) — "Neu" is only how it's labeled to the user,
// here and in every Tag/pill below.
const STATUS_FILTER_OPTIONS = [
  { value: 'Abgeschlossen', label: 'Abgeschlossen' },
  { value: 'In Bearbeitung', label: 'In Bearbeitung' },
  { value: 'Nicht begonnen', label: 'Neu' },
];

function statusLabel(status: string): string {
  return STATUS_FILTER_OPTIONS.find((opt) => opt.value === status)?.label ?? status;
}

interface DetailCheckApiRow {
  workflow_id: string;
  quick_check_id: number | null;
  street_house_number: string | null;
  postal_code: string | null;
  city: string;
  year_of_construction: number;
  living_area_m2: string | number;
  purchase_price: string | number;
  property_category: string | null;
  parking_spaces: number | null;
  energy_efficiency: string | null;
  recommendation_level: string | null;
  updated_at: string;
  has_acquisition_costs: boolean;
  has_rental: boolean;
  has_financing: boolean;
  has_depreciation: boolean;
  has_renovation: boolean;
  has_calculator: boolean;
  has_location_score: boolean;
  has_comparison: boolean;
}

function computeResumeState(row: DetailCheckApiRow): { resumed: boolean; resumeRoute: string } {
  const stepDone = [
    true, // property-data — always true, this row wouldn't exist otherwise
    row.has_acquisition_costs,
    row.has_rental,
    row.has_financing,
    row.has_depreciation,
    row.has_renovation,
    row.has_calculator,
    row.has_location_score,
    row.has_comparison,
  ];

  let furthestIndex = 0;
  for (let i = 1; i < stepDone.length; i++) {
    if (stepDone[i]) furthestIndex = i;
    else break;
  }

  if (furthestIndex === 0) {
    return { resumed: false, resumeRoute: STEP_ROUTES[0] };
  }

  const nextIndex = furthestIndex + 1;
  return {
    resumed: true,
    resumeRoute: nextIndex < STEP_ROUTES.length ? STEP_ROUTES[nextIndex] : 'result',
  };
}

function statusTagVariant(status: DetailCheckRow['status']) {
  if (status === 'Abgeschlossen') return 'success';
  if (status === 'In Bearbeitung') return 'info';
  return 'muted';
}

export default function DetailCheckOverviewPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const [takingOverId, setTakingOverId] = useState<string | null>(null);
  const [rows, setRows] = useState<DetailCheckRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [rowPendingDelete, setRowPendingDelete] = useState<DetailCheckRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await authFetch('/api/detail-checks', { cache: 'no-store' });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json() as DetailCheckApiRow[];
        if (cancelled) return;
        setRows(data.map((row) => {
          const resumeState = computeResumeState(row);
          const status = row.recommendation_level
            ? 'Abgeschlossen' as const
            : resumeState.resumed
              ? 'In Bearbeitung' as const
              : 'Nicht begonnen' as const;

          return {
            workflowId: row.workflow_id,
            quickCheckId: row.quick_check_id,
            address: row.street_house_number || 'Adresse noch nicht erfasst',
            postalCode: row.postal_code || '',
            city: row.city,
            constructionYear: Number(row.year_of_construction),
            livingAreaM2: Number(row.living_area_m2),
            purchasePrice: Number(row.purchase_price),
            propertyCategory: row.property_category,
            parkingSpaces: row.parking_spaces ?? 0,
            energyEfficiency: row.energy_efficiency,
            status,
            updatedAt: row.updated_at,
            ...resumeState,
          };
        }));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Detailbewertungen konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const rowSuffix = (row: DetailCheckRow) => row.quickCheckId
    ? `?quickCheckId=${encodeURIComponent(row.quickCheckId)}`
    : `?workflowId=${encodeURIComponent(row.workflowId)}`;

  const openRow = useCallback((row: DetailCheckRow) => {
    router.push(`/property-valuation/detail-check/${row.resumeRoute}${rowSuffix(row)}`);
  }, [router]);

  // Creates the Bestandsobjekt directly from what the detail check already
  // captured — no intermediate form, matching "In Bestandsobjekte
  // übernehmen" being a one-click action from the row menu.
  const takeOverToBestandsobjekte = useCallback(async (row: DetailCheckRow) => {
    if (!user) return;
    setTakingOverId(row.workflowId);
    try {
      const created = await createProperty({
        userId: user.id,
        cityId: null,
        propertyAbbreviation: null,
        street: row.address,
        houseNumber: '',
        city: row.city,
        postalCode: row.postalCode,
        federalState: '',
        squareMeters: row.livingAreaM2,
        numberOfRooms: null,
        yearOfConstruction: row.constructionYear,
        energyEfficient: (row.energyEfficiency || null) as EnergyEfficient | null,
        propertyCategory: row.propertyCategory,
        imageUrl: null,
        numberOfUnits: 1,
      });
      if (!created) {
        setError('Objekt konnte nicht angelegt werden.');
        return;
      }

      if (row.purchasePrice > 0) {
        await createAcquisitionCosts({
          propertyId: created.propertyId,
          parkingSpaceId: null,
          propertyPurchasePrice: row.purchasePrice,
          pricePerSqm: null,
          broker: null,
          brokerValue: null,
          notary: null,
          notaryValue: null,
          landRegistry: null,
          landRegistryValue: null,
          realEstateTax: null,
          realEstateTaxValue: null,
          adjustmentVariable: null,
          adjustmentVariableValue: null,
          totalAncillaryCostsValue: null,
          totalAncillaryCosts: null,
          parkingSpacePurchasePrice: null,
        });
      }

      if (row.parkingSpaces > 0) {
        await createParkingSpace({
          propertyId: created.propertyId,
          parkingSpaceType: 'OTHER',
          numberOfParkingSpaces: row.parkingSpaces,
        });
      }

      router.push(`/existing-properties/${created.propertyId}`);
    } finally {
      setTakingOverId(null);
    }
  }, [router, user]);

  const handleConfirmDelete = async () => {
    if (!rowPendingDelete) return;
    setIsDeleting(true);
    try {
      const response = await authFetch('/api/detail-checks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: rowPendingDelete.workflowId }),
      });
      if (!response.ok) throw new Error(await response.text());
      setRows((prev) => prev.filter((r) => r.workflowId !== rowPendingDelete.workflowId));
      setRowPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Detailbewertung konnte nicht gelöscht werden.');
    } finally {
      setIsDeleting(false);
    }
  };

  const menuItems = useCallback((row: DetailCheckRow): MenuItem[] => [
    {
      label: 'In Bestandsobjekte übernehmen',
      icon: <Building2 className="h-4 w-4" />,
      disabled: takingOverId === row.workflowId,
      onClick: () => void takeOverToBestandsobjekte(row),
    },
    {
      label: BUTTON_DETAILS.Delete.label,
      icon: <BUTTON_DETAILS.Delete.icon />,
      destructive: true,
      onClick: () => setRowPendingDelete(row),
    },
  ], [takeOverToBestandsobjekte, takingOverId]);

  const columns: TableColumn<DetailCheckRow>[] = useMemo(() => [
    {
      key: 'actions',
      label: '',
      width: '48px',
      renderCell: (_value, row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button iconOnly icon={<MoreVertical className="h-4 w-4" />} variant="ghost" size="sm" menuItems={menuItems(row)} />
        </div>
      ),
    },
    { key: 'address', label: 'Objekt', sortable: true, filterable: true },
    { key: 'postalCode', label: 'PLZ', sortable: true, filterable: true, width: '100px' },
    { key: 'city', label: 'Ort', sortable: true, filterable: true },
    { key: 'constructionYear', label: 'Baujahr', sortable: true, filterable: true, width: '100px' },
    {
      key: 'livingAreaM2',
      label: 'Wohnfläche',
      sortable: true,
      filterable: true,
      align: 'right',
      renderCell: (value) => `${Number(value).toLocaleString('de-DE')} m²`,
    },
    {
      key: 'purchasePrice',
      label: 'Kaufpreis',
      sortable: true,
      filterable: true,
      align: 'right',
      renderCell: (value) => Number(value) > 0 ? `${Number(value).toLocaleString('de-DE')} €` : 'Noch nicht erfasst',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      filterable: true,
      filterOptions: STATUS_FILTER_OPTIONS,
      renderCell: (value) => (
        <Tag label={statusLabel(String(value))} variant={statusTagVariant(value as DetailCheckRow['status'])} dot />
      ),
    },
    {
      key: 'updatedAt',
      label: 'Zuletzt bearbeitet',
      sortable: true,
      filterable: true,
      renderCell: (value) => new Date(String(value)).toLocaleDateString('de-DE'),
    },
  ], [menuItems]);

  const displayedRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = query
      ? rows.filter((row) => `${row.address} ${row.postalCode} ${row.city}`.toLowerCase().includes(query))
      : rows;

    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      filtered = filtered.filter((row) =>
        String(row[key] ?? '').toLowerCase().includes(lower)
      );
    }

    return [...filtered].sort((a, b) => {
      const left = a[sortKey] as string | number;
      const right = b[sortKey] as string | number;
      const result = left < right ? -1 : left > right ? 1 : 0;
      return sortDirection === 'asc' ? result : -result;
    });
  }, [rows, search, columnFilters, sortDirection, sortKey]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleColumnFilterChange = (key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = search.trim() !== '' || Object.values(columnFilters).some((v) => v);
  const handleResetFilters = () => {
    setSearch('');
    setColumnFilters({});
  };

  return (
    <div className="min-h-screen bg-background">
      <main className={PAGE_CONTAINER_CLASS}>
        <Header items={[{ label: 'Objektbewertung' }, { label: 'Detailbewertungen' }]} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-sm flex-1 min-w-[220px]">
            <TextFieldWithIcon type="search" icon={Icons.Search} placeholder="Detailbewertungen durchsuchen" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Link href="/property-valuation/detail-check/property-data?new=true">
            <Button label={BUTTON_DETAILS.AddDetailCheck.label} icon={<BUTTON_DETAILS.AddDetailCheck.icon />} variant="primary" hideLabelOnMobile />
          </Link>
        </div>

        {/* Status filter pills — mobile only; the desktop table has a filter
            dropdown in the Status column header instead. */}
        <div className="mt-4 md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => handleColumnFilterChange('status', '')}
            className={cn(
              "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
              !columnFilters.status
                ? "bg-primary text-primary-foreground"
                : "bg-transparent border border-border text-foreground hover:bg-muted"
            )}
          >
            Alle
          </button>
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleColumnFilterChange('status', opt.value)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                columnFilters.status === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent border border-border text-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(authLoading || isLoading) && <LoadingScreen fullScreen={false} />}
        {error && !isLoading && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Fehler beim Laden: {error}</div>}

        {!authLoading && !isLoading && !error && (
          <div className="mt-4">
            {rows.length === 0 ? (
              <NoResult title="Noch keine Detailbewertungen vorhanden" message="Legen Sie eine neue Detailbewertung an oder starten Sie eine aus einer Ersteinschätzung." className="py-24" />
            ) : displayedRows.length === 0 ? (
              <NoResult
                title="Keine Treffer"
                message="Kein Eintrag entspricht den aktuellen Suchbegriffen oder Filtern."
                className="py-24"
                action={
                  hasActiveFilters && (
                    <Button
                      label="Filter zurücksetzen"
                      icon={<Icons.Filter className="w-4 h-4" />}
                      variant="outline"
                      type="button"
                      onClick={handleResetFilters}
                    />
                  )
                }
              />
            ) : (
              <Table<DetailCheckRow>
                columns={columns}
                data={displayedRows}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                columnFilters={columnFilters}
                onColumnFilterChange={handleColumnFilterChange}
                onRowClick={openRow}
                footerLeft={`${displayedRows.length} Einträge`}
                pageSize={10}
                renderMobileCard={(row) => (
                  <div onClick={() => openRow(row)} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{row.address}</p>
                        <p className="text-sm text-primary truncate">{row.city}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Button iconOnly icon={<MoreVertical className="h-4 w-4" />} variant="ghost" size="sm" menuItems={menuItems(row)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Tag label={statusLabel(row.status)} variant={statusTagVariant(row.status)} dot />
                      <span className="text-sm text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        )}
      </main>

      <ConfirmDeleteModal
        open={rowPendingDelete !== null}
        onCancel={() => setRowPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Detailbewertung löschen?"
        confirmDisabled={isDeleting}
      >
        <p className="text-sm text-muted-foreground">
          Möchten Sie <span className="font-medium text-foreground">{rowPendingDelete?.address}</span>, {rowPendingDelete?.postalCode} {rowPendingDelete?.city} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
      </ConfirmDeleteModal>
    </div>
  );
}
