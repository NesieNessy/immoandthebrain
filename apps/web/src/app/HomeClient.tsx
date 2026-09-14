'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDashboardData, type DashboardPropertyRow, type PropertyRowStatus } from '@/hooks/useDashboardData';
import { Icons, LoadingScreen, PAGE_CONTAINER_CLASS, Table, Tag, type TableColumn } from '@/components/ui';
import { cn, deCurrencyFormatter, formatRelativeDe } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Small formatting helpers, specific to this page's KPI-scale numbers
// ---------------------------------------------------------------------------

function formatEuro(value: number): string {
  return `${deCurrencyFormatter.format(Math.round(value))} €`;
}

/** "1,24 Mio €" above one million, plain euros below — matches how large
 *  portfolio totals are conventionally shown, vs. a seven-digit euro figure. */
function formatEuroCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio €`;
  }
  return formatEuro(value);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

const STATUS_VARIANT: Record<PropertyRowStatus, 'success' | 'warning'> = {
  vermietet: 'success',
  leerstand: 'warning',
  auszug: 'warning',
};

// ---------------------------------------------------------------------------
// Presentational building blocks
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  iconClassName,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-md', iconClassName)}>
        {icon}
      </span>
      <div className="mt-3 text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground break-words">{value}</div>
      {detail && <p className="mt-1 text-xs font-medium text-muted-foreground">{detail}</p>}
    </div>
  );
}

function SectionCard({
  title,
  allHref,
  children,
}: {
  title: string;
  allHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {allHref && (
          <Link href={allHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Alle
            <Icons.ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HomeClient() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const data = useDashboardData(user?.id);

  if (authLoading) {
    return <LoadingScreen />;
  }

  const today = format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de });
  const taskCount = data.tasks.length;

  const propertyColumns: TableColumn<Record<string, unknown>>[] = [
    {
      key: 'address',
      label: 'Objekt',
      renderCell: (_v, row) => {
        const r = row.row as DashboardPropertyRow;
        return (
          <span className="flex flex-col">
            <span className="font-medium text-foreground">{r.address}</span>
            <span className="text-xs text-muted-foreground">{r.city}</span>
          </span>
        );
      },
    },
    {
      key: 'units',
      label: 'Einh.',
      width: '80px',
      renderCell: (_v, row) => {
        const r = row.row as DashboardPropertyRow;
        return <span>{r.occupiedUnits}/{r.totalUnits}</span>;
      },
    },
    {
      key: 'rent',
      label: 'Miete p.M.',
      width: '120px',
      renderCell: (_v, row) => formatEuro((row.row as DashboardPropertyRow).monthlyRent),
    },
    {
      key: 'status',
      label: 'Status',
      width: '140px',
      renderCell: (_v, row) => {
        const r = row.row as DashboardPropertyRow;
        return <Tag label={r.statusLabel} variant={STATUS_VARIANT[r.status]} />;
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-12">
      <main className={cn(PAGE_CONTAINER_CLASS, 'pt-6 flex flex-col gap-6')}>

        {/* Greeting */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Guten Morgen 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground capitalize">{today}</p>
          </div>
          {taskCount > 0 && (
            <Tag label={`${taskCount} Aufgabe${taskCount === 1 ? '' : 'n'} warten`} variant="orange" size="md" />
          )}
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={<Icons.Home className="w-5 h-5" />}
            iconClassName="bg-primary/15 text-primary"
            label="Immobilienwerte"
            value={formatEuroCompact(data.kpis.immobilienwerte)}
          />
          <StatTile
            icon={<Icons.TrendingUp className="w-5 h-5" />}
            iconClassName="bg-success/15 text-success"
            label="Mieteinnahmen p.M."
            value={formatEuro(data.kpis.mieteinnahmen)}
            detail={data.kpis.mietDeltaText ?? undefined}
          />
          <StatTile
            icon={<Icons.PieChart className="w-5 h-5" />}
            iconClassName="bg-secondary/15 text-secondary"
            label="Ø Rendite"
            value={formatPercent(data.kpis.renditePercent)}
          />
          <StatTile
            icon={<Icons.Building2 className="w-5 h-5" />}
            iconClassName="bg-accent-violet/15 text-accent-violet"
            label="Vermietungsquote"
            value={formatPercent(data.kpis.vermietungsquotePercent)}
            detail={data.kpis.vacantUnitsCount > 0 ? `${data.kpis.vacantUnitsCount} Einheit${data.kpis.vacantUnitsCount === 1 ? '' : 'en'} leer` : 'Voll vermietet'}
          />
        </div>

        {/* Bestandsobjekte + Aufgaben / KI-Hinweise */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-6">
            <SectionCard title="Bestandsobjekte" allHref="/existing-properties">
              {data.isLoading ? (
                <EmptyRow label="Lädt…" />
              ) : data.properties.length === 0 ? (
                <EmptyRow label="Noch keine Bestandsobjekte." />
              ) : (
                <Table
                  columns={propertyColumns}
                  data={data.properties.map((r) => ({ ...r, row: r }))}
                  onRowClick={(row) => router.push(`/existing-properties/${(row.row as DashboardPropertyRow).propertyId}`)}
                  showFooter={false}
                />
              )}
            </SectionCard>

            <SectionCard title="Finanzstatus kumuliert" allHref="/existing-properties">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <span className="text-muted-foreground">Immobilienwerte</span>
                <span className="text-right font-medium text-foreground">{formatEuroCompact(data.finanzstatus.immobilienwerte)}</span>
                <span className="text-muted-foreground">Rendite</span>
                <span className="text-right font-medium text-foreground">{formatPercent(data.finanzstatus.renditePercent)}</span>
                <span className="text-muted-foreground">Mieteinnahmen p.M.</span>
                <span className="text-right font-medium text-foreground">{formatEuro(data.finanzstatus.mieteinnahmen)}</span>
                <span className="text-muted-foreground">Eigenkapitalquote</span>
                <span className="text-right font-medium text-foreground">{formatPercent(data.finanzstatus.eigenkapitalquotePercent)}</span>
                <span className="text-muted-foreground">Zinsausgaben p.a.</span>
                <span className="text-right font-medium text-destructive">-{formatEuro(data.finanzstatus.zinsausgabenProJahr)}</span>
                <span className="text-muted-foreground">Tilgung p.a.</span>
                <span className="text-right font-medium text-destructive">-{formatEuro(data.finanzstatus.tilgungProJahr)}</span>
                <span className="text-muted-foreground pt-2 border-t border-border">Cash Flow p.a.</span>
                <span className={cn('text-right font-semibold pt-2 border-t border-border', data.finanzstatus.cashFlowProJahr >= 0 ? 'text-success' : 'text-destructive')}>
                  {data.finanzstatus.cashFlowProJahr >= 0 ? '+' : ''}{formatEuro(data.finanzstatus.cashFlowProJahr)}
                </span>
              </div>
            </SectionCard>
          </div>

          <div className="flex flex-col gap-6">
            <SectionCard title="Aufgaben">
              {data.isLoading ? (
                <EmptyRow label="Lädt…" />
              ) : data.tasks.length === 0 ? (
                <EmptyRow label="Keine offenen Aufgaben." />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {data.tasks.map((task) => (
                    <li key={task.id}>
                      <Link href={task.href} className="flex items-center gap-3 py-3 hover:bg-primary/5 -mx-1 px-1 rounded-md transition-colors">
                        <span className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                          task.urgency === 'today' ? 'bg-warning/15 text-warning' : task.urgency === 'open' ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
                        )}>
                          <Icons.Wrench className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{task.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{task.sublabel}</span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">{task.dueLabel}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="KI-Hinweise">
              {data.isLoading ? (
                <EmptyRow label="Lädt…" />
              ) : data.hints.length === 0 ? (
                <EmptyRow label="Keine Hinweise." />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {data.hints.map((hint) => (
                    <li key={hint.id}>
                      <Link href={hint.href} className="flex items-center gap-3 py-3 hover:bg-primary/5 -mx-1 px-1 rounded-md transition-colors">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
                          <Icons.AlertTriangle className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{hint.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{hint.sublabel}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Zuletzt bearbeitet + Letzte Dokumente */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <SectionCard title="Zuletzt bearbeitet" allHref="/existing-properties">
            {data.isLoading ? (
              <EmptyRow label="Lädt…" />
            ) : data.recentItems.length === 0 ? (
              <EmptyRow label="Noch keine Aktivität." />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.recentItems.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-3 py-3 hover:bg-primary/5 -mx-1 px-1 rounded-md transition-colors">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Icons.FileText className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDe(item.timestamp)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Letzte Dokumente" allHref="/documents">
            {data.isLoading ? (
              <EmptyRow label="Lädt…" />
            ) : data.recentDocuments.length === 0 ? (
              <EmptyRow label="Noch keine Dokumente." />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.recentDocuments.map((doc) => (
                  <li key={doc.id}>
                    <Link href={doc.href} className="flex items-center gap-3 py-3 hover:bg-primary/5 -mx-1 px-1 rounded-md transition-colors">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Icons.FileText className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{doc.name}</span>
                      <Tag
                        label={doc.ok ? 'i.O.' : 'Zu prüfen'}
                        variant={doc.ok ? 'success' : 'warning'}
                        size="sm"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
