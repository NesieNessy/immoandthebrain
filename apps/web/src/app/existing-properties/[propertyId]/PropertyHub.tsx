"use client";

import { BESTANDSOBJEKTE_BREADCRUMB_ROOT, formatUnitLabel, PROPERTY_CATEGORY_LABEL, PropertyLoadingPage } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, Header, Icons, Modal, NotFoundScreen, PAGE_CONTAINER_CLASS, SectionLabel, Tag, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { archiveProperty, deleteProperty, getPropertyOverviewById, type PropertyOverview } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { cn } from '@/lib/utils';
import type { PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface HubCard {
  key: string;
  title: string;
  description: string;
  /**
   * Navigates to `/existing-properties/{propertyId}/{route}` when scope is
   * "property", or `/existing-properties/{propertyId}/{route}/{unitId}` when
   * scope is "unit" — the whole reason PropertyHub is entered per-Einheit.
   */
  route: string;
  scope: 'property' | 'unit';
  /** Runs instead of navigating when set (e.g. opening a confirm dialog). */
  onClick?: () => void;
  icon: React.ElementType;
  colorClass: string;
}

// Route segments match the real folders under [propertyId]/.
const OBJEKTVERWALTUNG: HubCard[] = [
  {
    key: 'property-data',
    title: 'Objektdaten',
    description: 'Adresse, Fläche, Baujahr und weitere Stammdaten pflegen',
    route: 'property-data',
    scope: 'property',
    icon: Icons.Database,
    colorClass: 'bg-primary/10 text-primary',
  },
  {
    key: 'adjust-rnd',
    title: 'Restnutzungsdauer',
    description: 'Restnutzungsdauer für die Abschreibung individuell festlegen',
    route: 'adjust-rnd',
    scope: 'property',
    icon: Icons.Clock,
    colorClass: 'bg-accent-sky/15 text-accent-sky',
  },
  {
    key: 'adjust-distribution',
    title: 'Kaufpreisaufteilung',
    description: 'Prozentuale Kaufpreisverteilung für die Abschreibung',
    route: 'adjust-distribution',
    scope: 'property',
    icon: Icons.PieChart,
    colorClass: 'bg-accent-violet/15 text-accent-violet',
  },
  {
    key: 'tenant-data-new',
    title: 'Neue Einheit',
    description: 'Weitere Wohn-, Gewerbe- oder Stellplatzeinheiten anlegen',
    route: 'tenant-data/new',
    scope: 'property',
    icon: Icons.Plus,
    colorClass: 'bg-primary/10 text-primary',
  },
];

const MIETE: HubCard[] = [
  {
    key: 'tenant-data',
    title: 'Mieterdaten',
    description: 'Kontaktdaten und Unterlagen des aktuellen Mieters verwalten',
    route: 'tenant-data',
    scope: 'unit',
    icon: Icons.Users,
    colorClass: 'bg-accent-terracotta/15 text-accent-terracotta',
  },
  {
    key: 'tenant-agreement',
    title: 'Mietvertrag',
    description: 'Mietkonditionen, Anpassungen und Dokumente verwalten',
    route: 'tenant-agreement',
    scope: 'unit',
    icon: Icons.FileSignature,
    colorClass: 'bg-secondary/15 text-secondary',
  },
  {
    key: 'tenant-history',
    title: 'Mieterhistorie',
    description: 'Alle bisherigen Mietverhältnisse und Mieterwechsel einsehen',
    route: 'tenant-history',
    scope: 'unit',
    icon: Icons.History,
    colorClass: 'bg-accent-sage/15 text-accent-sage',
  },
  {
    key: 'rental-trends',
    title: 'Mietentwicklung',
    description: 'Entwicklung der Mietpreise über die Zeit analysieren',
    route: 'rental-trends',
    scope: 'unit',
    icon: Icons.TrendingUp,
    colorClass: 'bg-success/15 text-success',
  },
  {
    key: 'tenant-move-out',
    title: 'Mieterauszug',
    description: 'Abnahmeprotokoll erstellen und Übergabe dokumentieren',
    route: 'tenant-move-out',
    scope: 'unit',
    icon: Icons.DoorOpen,
    colorClass: 'bg-accent-coral/15 text-accent-coral',
  },
];

const FINANZEN_DOKUMENTE: HubCard[] = [
  {
    key: 'service-charge-settlement',
    title: 'Nebenkostenabrechnung',
    description: 'Jährliche Nebenkostenabrechnungen erstellen und verwalten',
    route: 'service-charge-settlement',
    scope: 'unit',
    icon: Icons.Receipt,
    colorClass: 'bg-warning/15 text-warning',
  },
  {
    key: 'tax-documents',
    title: 'Steuerunterlagen',
    description: 'Belege und Dokumente für die Steuererklärung sammeln',
    route: 'tax-documents',
    scope: 'property',
    icon: Icons.Landmark,
    colorClass: 'bg-info/15 text-info',
  },
  {
    key: 'key-metrics',
    title: 'Kennzahlen',
    description: 'Rendite, KPF und weitere Kennzahlen im Überblick auswerten',
    route: 'key-metrics',
    scope: 'property',
    icon: Icons.BarChart3,
    colorClass: 'bg-accent-violet/15 text-accent-violet',
  },
  {
    key: 'contractors',
    title: 'Handwerker',
    description: 'Handwerksaufträge verwalten und Angebote einholen',
    route: 'contractors',
    scope: 'property',
    icon: Icons.Wrench,
    colorClass: 'bg-success/15 text-success',
  },
];

const WEITERE_AKTIONEN: HubCard[] = [
  {
    key: 'sale',
    title: 'Verkauf',
    description: 'Verkaufsprozess einleiten und Unterlagen vorbereiten',
    route: 'sale',
    scope: 'property',
    icon: Icons.ShoppingCart,
    colorClass: 'bg-accent/15 text-accent',
  },
];

function HubCardTile({ card, propertyId, unitId }: { card: HubCard; propertyId: string; unitId: string | null }) {
  const router = useRouter();
  const Icon = card.icon;
  const href = card.scope === 'unit' && unitId
    ? `/existing-properties/${propertyId}/${card.route}/${unitId}`
    : `/existing-properties/${propertyId}/${card.route}`;
  return (
    <button
      type="button"
      onClick={() => card.onClick ? card.onClick() : router.push(href)}
      className="text-left p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", card.colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-sm font-semibold text-foreground">{card.title}</p>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.description}</p>
    </button>
  );
}

export default function PropertyHub({ propertyId, unitId }: { propertyId: string; unitId: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [property, setProperty] = useState<PropertyOverview | null>(null);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    const id = parseInt(propertyId, 10);
    Promise.all([getPropertyOverviewById(id), getPropertyUnitsByProperty(id)]).then(([p, foundUnits]) => {
      setProperty(p);
      setUnits(foundUnits);
      setIsLoading(false);
    });
  }, [propertyId]);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const success = await deleteProperty(parseInt(propertyId, 10));
    setIsDeleting(false);
    if (success) {
      router.push('/existing-properties');
    }
  };

  const handleConfirmArchive = async () => {
    setIsArchiving(true);
    const archived = await archiveProperty(parseInt(propertyId, 10));
    setIsArchiving(false);
    if (archived) {
      showToast('Objekt archiviert.');
      router.push('/existing-properties');
    } else {
      showToast('Objekt konnte nicht archiviert werden.', 'error');
    }
  };

  if (isLoading) return <PropertyLoadingPage />;

  if (!property) return <NotFoundScreen message="Objekt nicht gefunden" />;

  const unit = unitId ? units.find((u) => u.propertyUnitId === Number(unitId)) ?? null : null;

  if (unitId && !unit) return <NotFoundScreen message="Einheit nicht gefunden" />;

  const categoryLabel = property.propertyCategory
    ? PROPERTY_CATEGORY_LABEL[property.propertyCategory] ?? property.propertyCategory
    : null;

  // Unit-scoped tiles (Mieterdaten, Mietvertrag, Nebenkostenabrechnung, …) only
  // make sense once a unit is selected — with none yet, only property-wide
  // setup actions (Objektdaten, Neue Einheit, …) are shown.
  const showUnitSections = unit !== null;
  const addressHref = units.length > 1 ? `/existing-properties/${propertyId}` : undefined;

  const breadcrumbItems: BreadcrumbItem[] = unit && units.length > 1
    ? [
      BESTANDSOBJEKTE_BREADCRUMB_ROOT,
      { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: addressHref },
      { label: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote) },
    ]
    : [
      BESTANDSOBJEKTE_BREADCRUMB_ROOT,
      { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}` },
    ];

  const weitereAktionen: HubCard[] = [
    ...WEITERE_AKTIONEN,
    // Already-archived properties have nothing left to archive.
    ...(!property.archivedAt
      ? [{
          key: 'archive-property',
          title: 'Archivierung',
          description: 'Objekt aus der Bestandsobjekte-Übersicht ausblenden',
          route: '',
          scope: 'property' as const,
          icon: Icons.Archive,
          colorClass: 'bg-muted text-muted-foreground',
          onClick: () => setArchiveModalOpen(true),
        }]
      : []),
    {
      key: 'delete-property',
      title: 'Löschung',
      description: 'Bestandsobjekt und alle Daten endgültig entfernen',
      route: '',
      scope: 'property',
      icon: Icons.Trash2,
      colorClass: 'bg-destructive/15 text-destructive',
      onClick: () => setDeleteModalOpen(true),
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-12">
      <main className={PAGE_CONTAINER_CLASS}>
        <Header items={breadcrumbItems} />
        <div className="flex items-center gap-2 flex-wrap">
          {categoryLabel && <Tag label={categoryLabel} variant="muted" size="md" />}
          <Tag label={`${property.squareMeters} m²`} variant="muted" size="md" />
          <Tag label={`Baujahr ${property.yearOfConstruction}`} variant="muted" size="md" />
          <Tag label={property.isRented ? 'Vermietet' : 'Unvermietet'} variant={property.isRented ? 'success' : 'warning'} size="md" />
        </div>

        {!showUnitSections && (
          <div className="mt-6 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-foreground">
            Für dieses Objekt ist noch keine Einheit angelegt. Lege eine Einheit an, um Mieterdaten, Mietvertrag und weitere Funktionen zu nutzen.
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <SectionLabel>Objektverwaltung</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {OBJEKTVERWALTUNG.map((card) => (
              <HubCardTile key={card.key} card={card} propertyId={propertyId} unitId={unitId} />
            ))}
          </div>
        </div>

        {showUnitSections && (
          <div className="mt-8 flex flex-col gap-3">
            <SectionLabel>Miete</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {MIETE.map((card) => (
                <HubCardTile key={card.key} card={card} propertyId={propertyId} unitId={unitId} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <SectionLabel>Finanzen &amp; Dokumente</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FINANZEN_DOKUMENTE.filter((card) => showUnitSections || card.scope === 'property').map((card) => (
              <HubCardTile key={card.key} card={card} propertyId={propertyId} unitId={unitId} />
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <SectionLabel>Weitere Aktionen</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {weitereAktionen.map((card) => (
              <HubCardTile key={card.key} card={card} propertyId={propertyId} unitId={unitId} />
            ))}
          </div>
        </div>
      </main>

      <ConfirmDeleteModal
        open={deleteModalOpen}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={() => void handleConfirmDelete()}
        title="Objekt löschen"
        confirmDisabled={isDeleting}
      >
        <p className="text-sm text-muted-foreground">
          Möchten Sie <span className="font-medium text-foreground">{property.street} {property.houseNumber}</span>,{' '}
          {property.postalCode} {property.city} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
      </ConfirmDeleteModal>

      <Modal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title="Objekt archivieren?"
        icon={<Icons.Archive className="w-5 h-5" />}
        footer={
          <>
            <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" disabled={isArchiving} onClick={() => setArchiveModalOpen(false)} />
            <Button label="Archivieren" variant="primary" disabled={isArchiving} onClick={() => void handleConfirmArchive()} />
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{property.street} {property.houseNumber}</span>,{' '}
          {property.postalCode} {property.city} wird aus der Bestandsobjekte-Übersicht ausgeblendet, bleibt aber über den Verlauf erreichbar.
        </p>
      </Modal>
    </div>
  );
}
