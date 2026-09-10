"use client";

import { NoResult } from '@/components/common';
import { BESTANDSOBJEKTE_BREADCRUMB_ROOT, PROPERTY_CATEGORY_FILTER_OPTIONS, RENTAL_STATUS_FILTER_OPTIONS } from '@/components/features/PropertyDisplay';
import { NewPropertyModal } from '@/components/features/NewPropertyModal';
import { PropertyCard } from '@/components/features/PropertyCard';
import { PropertyListRow } from '@/components/features/PropertyListRow';
import type { MenuItem } from '@/components/ui';
import { Button, ConfirmDeleteModal, Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, Switch, TextFieldWithIcon } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useProperties } from '@/hooks/useProperties';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { cn } from '@/lib/utils';
import type { PropertyOverview } from '@/lib/supabase/property.supabase';
import { KeyRound, LayoutGrid } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE_OPTIONS = [12, 24, 48];

type ViewMode = 'grid' | 'list';

function FilterPill({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const active = value !== '';
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(
          "appearance-none pl-8 pr-7 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors",
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-transparent border-border text-foreground hover:bg-muted"
        )}
      >
        <option value="">Alle</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <Icon className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none", active ? "text-primary-foreground" : "text-muted-foreground")} />
      <Icons.ChevronDown className={cn("absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none", active ? "text-primary-foreground" : "text-muted-foreground")} />
    </div>
  );
}

export default function ExistingPropertiesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { data: properties, isLoading, error, deleteSelected, archiveSelected } = useProperties(user?.id);

  const [search, setSearch] = useState('');
  const [objektTyp, setObjektTyp] = useState('');
  const [vermietung, setVermietung] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<PropertyOverview | null>(null);
  const [newPropertyModalOpen, setNewPropertyModalOpen] = useState(false);
  // Archived properties are hidden by default — every "current" overview
  // elsewhere in the app only ever shows active properties too.
  const [showHistory, setShowHistory] = useState(false);

  const handlePropertyClick = (propertyId: number) => {
    router.push(`/existing-properties/${propertyId}`);
  };

  const handleConfirmDelete = async () => {
    if (!propertyToDelete) return;
    const id = propertyToDelete.propertyId;
    setDeletingId(id);
    try {
      await deleteSelected(id);
      setPropertyToDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchive = async (property: PropertyOverview) => {
    setArchivingId(property.propertyId);
    try {
      await archiveSelected(property.propertyId);
    } finally {
      setArchivingId(null);
    }
  };

  const buildMenuItems = (property: PropertyOverview): MenuItem[] => [
    {
      label: BUTTON_DETAILS.Edit.label,
      icon: <BUTTON_DETAILS.Edit.icon />,
      onClick: () => handlePropertyClick(property.propertyId),
    },
    // Already-archived properties (shown via "Verlauf") have nothing left
    // to archive — only current ones offer the action.
    ...(!property.archivedAt
      ? [{
          label: 'Archivieren',
          icon: <Icons.Archive className="w-4 h-4" />,
          disabled: archivingId === property.propertyId,
          onClick: () => void handleArchive(property),
        }]
      : []),
    {
      label: BUTTON_DETAILS.Delete.label,
      icon: <BUTTON_DETAILS.Delete.icon />,
      destructive: true,
      disabled: deletingId === property.propertyId,
      onClick: () => setPropertyToDelete(property),
    },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties.filter((p) => {
      if (!showHistory && p.archivedAt) return false;
      if (q && !`${p.street} ${p.houseNumber} ${p.city} ${p.postalCode} ${p.propertyAbbreviation}`.toLowerCase().includes(q)) return false;
      if (objektTyp && p.propertyCategory !== objektTyp) return false;
      if (vermietung === 'vermietet' && !p.isRented) return false;
      if (vermietung === 'unvermietet' && p.isRented) return false;
      return true;
    });
  }, [properties, search, objektTyp, vermietung, showHistory]);

  const hasActiveFilters = search.trim() !== '' || objektTyp !== '' || vermietung !== '';
  const handleResetFilters = () => {
    setSearch('');
    setObjektTyp('');
    setVermietung('');
  };

  // A new filtered result set (or a page-size change) always starts back at
  // page 1 — an out-of-range page would otherwise render nothing.
  useEffect(() => {
    setPage(1);
  }, [filtered, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen bg-background pb-12">
      <main className={PAGE_CONTAINER_CLASS}>
        <Header items={[BESTANDSOBJEKTE_BREADCRUMB_ROOT]} />

        {/* ── Search + filter pills + view toggle + add button ────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-sm flex-1 min-w-[220px]">
            <TextFieldWithIcon
              type="search"
              icon={Icons.Search}
              placeholder="Adresse oder Stadt suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button
            label={BUTTON_DETAILS.AddProperty.label}
            icon={<BUTTON_DETAILS.AddProperty.icon />}
            variant="primary"
            hideLabelOnMobile
            onClick={() => setNewPropertyModalOpen(true)}
          />

          <FilterPill
            icon={Icons.Building2}
            label="Objekttyp"
            value={objektTyp}
            options={PROPERTY_CATEGORY_FILTER_OPTIONS}
            onChange={setObjektTyp}
          />
          <FilterPill
            icon={KeyRound}
            label="Vermietung"
            value={vermietung}
            options={RENTAL_STATUS_FILTER_OPTIONS}
            onChange={setVermietung}
          />

          <Switch
            label="Verlauf"
            checked={showHistory}
            onCheckedChange={setShowHistory}
          />

          <div className="hidden md:inline-flex items-center rounded-lg border border-border p-0.5 ml-auto">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Rasteransicht"
              aria-pressed={viewMode === 'grid'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === 'grid' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Listenansicht"
              aria-pressed={viewMode === 'list'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === 'list' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icons.List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(authLoading || isLoading) && <LoadingScreen fullScreen={false} />}

        {error && !isLoading && (
          <div className="mt-4 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            Fehler beim Laden: {error}
          </div>
        )}

        {!authLoading && !isLoading && !error && (
          <div className="mt-4">
            {properties.length === 0 && (
              <NoResult
                title="Noch keine Objekte vorhanden"
                message="Übernehmen Sie eine Ersteinschätzung in Ihr Portfolio, um hier Objekte zu sehen."
                className="py-24"
              />
            )}

            {properties.length > 0 && filtered.length === 0 && (
              <NoResult
                title="Keine Treffer"
                message="Kein Objekt entspricht den aktuellen Suchbegriffen oder Filtern."
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

            {filtered.length > 0 && (
              <>
                <div className="max-h-[700px] overflow-y-auto pr-1">
                  {/* Mobile — always the card grid; the grid/list toggle only
                      applies at md+, same md:hidden / hidden md:block split
                      the quick-check overview uses for its mobile cards. */}
                  <div className="grid grid-cols-1 gap-4 md:hidden">
                    {pageItems.map((property, index) => (
                      <PropertyCard
                        key={property.propertyId}
                        property={property}
                        colorIndex={index}
                        menuItems={buildMenuItems(property)}
                        onClick={() => handlePropertyClick(property.propertyId)}
                      />
                    ))}
                  </div>

                  <div className="hidden md:block">
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                        {pageItems.map((property, index) => (
                          <PropertyCard
                            key={property.propertyId}
                            property={property}
                            colorIndex={index}
                            menuItems={buildMenuItems(property)}
                            onClick={() => handlePropertyClick(property.propertyId)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {pageItems.map((property, index) => (
                          <PropertyListRow
                            key={property.propertyId}
                            property={property}
                            colorIndex={index}
                            menuItems={buildMenuItems(property)}
                            onClick={() => handlePropertyClick(property.propertyId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Pagination footer ──────────────────────────────────── */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{filtered.length} Objekte</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      Objekte pro Seite
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="px-1.5 py-1 bg-background border border-border rounded-md cursor-pointer
                                   focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary
                                   text-foreground transition-colors"
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>

                    <span>Seite {currentPage} von {totalPages}</span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        aria-label="Vorherige Seite"
                        className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Icons.ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        aria-label="Nächste Seite"
                        className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Icons.ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <ConfirmDeleteModal
        open={propertyToDelete !== null}
        onCancel={() => setPropertyToDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Objekt löschen"
        confirmDisabled={deletingId === propertyToDelete?.propertyId}
      >
        {propertyToDelete && (
          <p className="text-sm text-muted-foreground">
            Möchten Sie <span className="font-medium text-foreground">{propertyToDelete.street} {propertyToDelete.houseNumber}</span>,{' '}
            {propertyToDelete.postalCode} {propertyToDelete.city} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        )}
      </ConfirmDeleteModal>

      <NewPropertyModal
        open={newPropertyModalOpen}
        onClose={() => setNewPropertyModalOpen(false)}
      />
    </div>
  );
}
