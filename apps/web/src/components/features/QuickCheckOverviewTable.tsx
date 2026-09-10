"use client";

import { NoResult } from '@/components/common';
import {
  CONDITION_FILTER_OPTIONS,
  CONDITION_PILL_LABEL,
  KpfBadge,
  STATUS_FILTER_OPTIONS,
  conditionVariant,
  getPlaceholderPortalUrl,
  toEntry,
  type QuickCheckEntry,
} from '@/components/features/QuickCheckDisplay';
import type { BreadcrumbItem, MenuItem, SortDirection, TableColumn } from '@/components/ui';
import { Button, Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, Table, TextFieldWithIcon, Tag } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { FieldLabels } from '@/constants/FieldLabels';
import { useQuickChecks } from '@/hooks/useQuickChecks';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { cn } from '@/lib/utils';
import { PropertyCondition } from '@immoandthebrain/types';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';

interface QuickCheckOverviewTableProps {
  /** false = quick-check overview (not yet detail-checked), true = detail-check overview. */
  detailCheck: boolean;
  breadcrumbItems: BreadcrumbItem[];
  addHref: string;
  addLabel: string;
  addIcon: React.ElementType;
  /** Non-delete row actions — delete is generic (wired to useQuickChecks
   *  internally) and always appended after these. */
  buildRowMenuItems: (row: QuickCheckEntry) => MenuItem[];
  /** Clicking anywhere on a row (or its mobile card) opens it — the row
   *  menu no longer needs its own "open" entry. */
  onRowClick: (row: QuickCheckEntry) => void;
  emptyTitle: string;
  emptyMessage: string;
}

/**
 * The quick-check and detail-check overview pages render the
 * same data (QuickCheckOverview rows) through the same table, search box,
 * mobile filter pills, and card layout — the only real differences are which
 * `detail_check` bucket they show and what each page's row menu can do
 * beyond "delete". Both page components stay responsible for their own
 * navigation/business logic via `buildRowMenuItems`; this component owns
 * the generic overview mechanics (fetch, search, sort, filter, pagination).
 */
export function QuickCheckOverviewTable({
  detailCheck,
  breadcrumbItems,
  addHref,
  addLabel,
  addIcon: AddIcon,
  buildRowMenuItems,
  onRowClick,
  emptyTitle,
  emptyMessage,
}: QuickCheckOverviewTableProps) {
  const { isLoading: authLoading } = useRequireAuth();
  const { data: rawData, isLoading, error, deleteSelected } = useQuickChecks(detailCheck);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('ingestDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const pillScrollRef = useRef<HTMLDivElement>(null);

  // Map DB rows → display entries once per fetch
  const allEntries = useMemo(() => rawData.map(toEntry), [rawData]);

  const handleColumnFilterChange = (key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = search !== '' || Object.values(columnFilters).some((v) => v);
  const handleResetFilters = () => {
    setSearch('');
    setColumnFilters({});
  };

  const handleDeleteRow = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      await deleteSelected([id]);
    } finally {
      setDeletingId(null);
    }
  }, [deleteSelected]);

  // Shared by the desktop table's actions column and the mobile card menu.
  const rowMenuItems = useCallback((row: QuickCheckEntry): MenuItem[] => [
    ...buildRowMenuItems(row),
    {
      label: BUTTON_DETAILS.Delete.label,
      icon: <BUTTON_DETAILS.Delete.icon />,
      destructive: true,
      disabled: deletingId === row.id,
      onClick: () => void handleDeleteRow(row.id),
    },
  ], [buildRowMenuItems, deletingId, handleDeleteRow]);

  const COLUMNS: TableColumn<QuickCheckEntry>[] = useMemo(() => [
    {
      key: 'actions',
      label: '',
      width: '48px',
      renderCell: (_value, row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            iconOnly
            icon={<Icons.MoreVertical className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            menuItems={rowMenuItems(row)}
          />
        </div>
      ),
    },
    {
      key: 'portalId',
      label: FieldLabels.QuickCheck.PortalId.de,
      sortable: true,
      filterable: true,
      renderCell: (value, row) => {
        const portalId = value as string;
        const url = getPlaceholderPortalUrl(row);
        if (!url) return <span className="text-muted-foreground">{portalId}</span>;
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {portalId}
          </a>
        );
      },
    },
    {
      key: 'kpfMultiplier',
      label: FieldLabels.QuickCheck.KpfMultiplier.de,
      sortable: true,
      filterable: true,
      align: 'center',
      width: '110px',
      renderCell: (value) => <KpfBadge value={value as number | null} />,
    },
    {
      key: 'purchasePrice',
      label: FieldLabels.QuickCheck.PurchasePrice.de,
      sortable: true,
      filterable: true,
      align: 'right',
      width: '140px',
      renderCell: (value) => (
        <span>{(value as number).toLocaleString('de-DE')} €</span>
      ),
    },
    {
      key: 'postalCode',
      label: FieldLabels.QuickCheck.PostalCode.de,
      sortable: true,
      filterable: true,
      width: '110px',
    },
    {
      key: 'constructionYear',
      label: FieldLabels.QuickCheck.ConstructionYear.de,
      sortable: true,
      filterable: true,
      width: '100px',
    },
    {
      key: 'condition',
      label: FieldLabels.QuickCheck.Condition.de,
      sortable: true,
      filterable: true,
      filterOptions: CONDITION_FILTER_OPTIONS,
      width: '170px',
      renderCell: (value) => {
        const condition = value as PropertyCondition;
        return <Tag label={condition} variant={conditionVariant[condition] ?? 'default'} />;
      },
    },
    {
      key: 'status',
      label: FieldLabels.QuickCheck.Status.de,
      sortable: true,
      filterable: true,
      filterOptions: STATUS_FILTER_OPTIONS,
      width: '110px',
      renderCell: (value) => (
        <Tag
          label={value as string}
          variant={value === 'aktiv' ? 'success' : 'muted'}
        />
      ),
    },
  ], [rowMenuItems]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // ── Filter + sort (client-side, data already capped at 100 by the hook) ─
  const { displayedData, totalCount } = useMemo(() => {
    const q = search.toLowerCase();
    let filtered = q
      ? allEntries.filter(
          (row) =>
            row.portalId.toLowerCase().includes(q) ||
            row.postalCode.includes(q) ||
            row.condition.toLowerCase().includes(q)
        )
      : allEntries;

    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      filtered = filtered.filter((row) =>
        String(row[key as keyof QuickCheckEntry] ?? '').toLowerCase().includes(lower)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof QuickCheckEntry];
      const bv = b[sortKey as keyof QuickCheckEntry];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return {
      displayedData: sorted,
      totalCount: sorted.length,
    };
  }, [allEntries, search, columnFilters, sortKey, sortDirection]);

  return (
    <div className="min-h-screen bg-background">
      <main className={PAGE_CONTAINER_CLASS}>

        {/* ── Page header ─────────────────────────────────────────────── */}
        <Header items={breadcrumbItems} />

        {/* ── Search bar + add button ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-sm flex-1 min-w-[220px]">
            <TextFieldWithIcon
              type="search"
              icon={Icons.Search}
              placeholder={FieldLabels.QuickCheck.SearchPlaceholder.de}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link href={addHref}>
            <Button
              label={addLabel}
              icon={<AddIcon />}
              variant="primary"
              hideLabelOnMobile
            />
          </Link>
        </div>

        {/* ── Status + condition filter pills — mobile only, one scrollable
               row; the desktop table has dropdown filters in the Status and
               Zustand column headers instead ──────────────────────────────── */}
        <div className="mt-4 md:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={() => pillScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
            className="shrink-0 p-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Nach links scrollen"
          >
            <Icons.ChevronLeft className="w-4 h-4" />
          </button>

          <div ref={pillScrollRef} className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
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

            <div className="shrink-0 w-px h-6 bg-border mx-1" />

            <button
              type="button"
              onClick={() => handleColumnFilterChange('condition', '')}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                !columnFilters.condition
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent border border-border text-foreground hover:bg-muted"
              )}
            >
              Alle
            </button>
            {CONDITION_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleColumnFilterChange('condition', opt.value)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  columnFilters.condition === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent border border-border text-foreground hover:bg-muted"
                )}
              >
                {CONDITION_PILL_LABEL[opt.value]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => pillScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
            className="shrink-0 p-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Nach rechts scrollen"
          >
            <Icons.ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ── Loading / error states ───────────────────────────────────── */}
        {(authLoading || isLoading) && <LoadingScreen fullScreen={false} />}

        {error && !isLoading && (
          <div className="mt-4 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            Fehler beim Laden: {error}
          </div>
        )}

        {/* ── Table / empty states ────────────────────────────────────── */}
        {!authLoading && !isLoading && !error && (
          <div className="mt-4">
            {allEntries.length === 0 && (
              <NoResult
                title={emptyTitle}
                message={emptyMessage}
                className="py-24"
              />
            )}

            {allEntries.length > 0 && displayedData.length === 0 && (
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
            )}

            {displayedData.length > 0 && (
              <Table<QuickCheckEntry>
                columns={COLUMNS}
                data={displayedData}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                columnFilters={columnFilters}
                onColumnFilterChange={handleColumnFilterChange}
                onRowClick={onRowClick}
                getRowClassName={(row) =>
                  row.status === 'inaktiv' ? 'opacity-40 grayscale' : undefined
                }
                footerLeft={`${totalCount} Einträge`}
                pageSize={10}
                renderMobileCard={(row) => (
                  <div
                    onClick={() => onRowClick(row)}
                    className={cn(
                      "bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50",
                      row.status === 'inaktiv' && 'opacity-40 grayscale'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      {(() => {
                        const url = getPlaceholderPortalUrl(row);
                        return url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline"
                          >
                            {row.portalId}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{row.portalId}</span>
                        );
                      })()}
                      <div onClick={(e) => e.stopPropagation()}>
                        <Button
                          iconOnly
                          icon={<Icons.MoreVertical className="w-4 h-4" />}
                          variant="ghost"
                          size="sm"
                          menuItems={rowMenuItems(row)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {FieldLabels.QuickCheck.PurchasePrice.de}
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {row.purchasePrice.toLocaleString('de-DE')} €
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {FieldLabels.QuickCheck.PostalCode.de}
                        </p>
                        <p className="text-sm font-semibold text-foreground">{row.postalCode}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {FieldLabels.QuickCheck.ConstructionYear.de}
                        </p>
                        <p className="text-sm font-semibold text-foreground">{row.constructionYear}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <Tag label={row.condition} variant={conditionVariant[row.condition] ?? 'default'} />
                      <KpfBadge value={row.kpfMultiplier} />
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        )}

      </main>
    </div>
  );
}
