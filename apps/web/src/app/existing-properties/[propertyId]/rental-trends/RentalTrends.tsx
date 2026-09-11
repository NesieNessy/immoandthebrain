"use client";

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { BESTANDSOBJEKTE_BREADCRUMB_ROOT } from '@/components/features/PropertyDisplay';
import { Button, Header, Icons, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, Tag, type BreadcrumbItem } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { cn, deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import { useState } from 'react';
import { useRentDevelopmentData } from './useRentDevelopmentData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
}

type TabKey = 'proposals' | 'schedule' | 'basis';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'proposals', label: 'Aktuelle Vorschläge' },
    { key: 'schedule', label: 'Zeitplan & Fristen' },
    { key: 'basis', label: 'Kalkulationsbasis' },
];

export default function RentalTrends({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const data = useRentDevelopmentData(propertyId, unitId);
    const [activeTab, setActiveTab] = useState<TabKey>('proposals');
    const [editingRent, setEditingRent] = useState(false);
    const [editingRenovation, setEditingRenovation] = useState(false);

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const { property, unit, hasMultipleUnits, tenancy, proposal558, proposal559 } = data;

    const breadcrumbItems: BreadcrumbItem[] = [
        BESTANDSOBJEKTE_BREADCRUMB_ROOT,
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(unit && hasMultipleUnits ? [{ label: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote) }] : []),
        { label: ExistingPropertiesUseCases.TenancyTrends },
    ];

    if (!unit || !tenancy) {
        return (
            <div className="min-h-screen bg-background pb-24">
                <main className={PAGE_CONTAINER_CLASS}>
                    <Header items={breadcrumbItems} />
                    <p className="mt-6 text-sm text-muted-foreground">
                        Für diese Einheit ist kein aktives Mietverhältnis hinterlegt — die Weiterentwicklung braucht eine laufende Vermietung als Berechnungsgrundlage.
                    </p>
                </main>
            </div>
        );
    }

    const openProposalCount = (proposal558 ? 1 : 0) + (proposal559 ? 1 : 0);
    const optimalPotential = (proposal558?.legalMaxAmount ?? 0) + (proposal559?.recommendedAmount ?? 0);
    const nextDeadline = [tenancy.rentAdjustmentReminderDate, tenancy.renovationAdjustmentReminderDate]
        .filter((d): d is string => Boolean(d))
        .sort()[0];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={breadcrumbItems} />

                <div className="flex flex-wrap items-center gap-2">
                    <Tag label={`Aktuelle Miete ${euro(tenancy.coldRent ?? 0)}`} variant="success" size="md" />
                    <Tag label={`Optimalpotenzial +${euro(optimalPotential)}`} variant="violet" size="md" />
                    {nextDeadline && <Tag label={`Nächste Frist ${formatDeDate(nextDeadline)}`} variant="orange" size="md" />}
                    <Tag label="Kalkulation aktualisiert heute" variant="muted" size="md" />
                    <Button
                        label="Neu berechnen"
                        icon={<Icons.RefreshCw className="w-4 h-4" />}
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={data.refresh}
                    />
                </div>

                <div className="mt-6 flex items-center gap-1 border-b border-border">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                                activeTab === tab.key
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {tab.key === 'proposals' && ` (${openProposalCount})`}
                        </button>
                    ))}
                </div>

                <div className="mt-6">
                    {activeTab === 'proposals' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/30 text-xs text-info">
                                <Icons.Info className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                    Der Kalkulator berechnet monatlich neue Vorschläge zur Gewinnmaximierung innerhalb des gesetzlichen Rahmens.
                                    Nicht bestätigte Vorschläge werden automatisch auf den Folgemonat verschoben und neu kalkuliert.
                                </span>
                            </div>

                            {proposal558 && (
                                <RentIncreaseCard
                                    tenancy={tenancy}
                                    proposal={proposal558}
                                    isResolving={data.isResolving === 'rent'}
                                    editing={editingRent}
                                    onEdit={() => setEditingRent(true)}
                                    onCancelEdit={() => setEditingRent(false)}
                                    onSaveAmount={async (amount) => { await data.setManualRentAmount(amount); setEditingRent(false); }}
                                    onAccept={() => void data.acceptRent()}
                                    onDefer={() => void data.deferRentToNextMonth()}
                                    onDecline={() => void data.declineRent()}
                                />
                            )}

                            {proposal559 && (
                                <RenovationCard
                                    tenancy={tenancy}
                                    proposal={proposal559}
                                    isResolving={data.isResolving === 'renovation'}
                                    editing={editingRenovation}
                                    onEdit={() => setEditingRenovation(true)}
                                    onCancelEdit={() => setEditingRenovation(false)}
                                    onSaveAmount={async (amount) => { await data.setManualRenovationAmount(amount); setEditingRenovation(false); }}
                                    onAccept={() => void data.acceptRenovation()}
                                    onDefer={() => void data.deferRenovationToNextMonth()}
                                    onDecline={() => void data.declineRenovation()}
                                />
                            )}

                            {!proposal558 && !proposal559 && (
                                <p className="text-sm text-muted-foreground">
                                    Bitte zuerst die Kalkulationsbasis befüllen, um Vorschläge zu berechnen.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === 'schedule' && <ScheduleTab tenancy={tenancy} history={data.historyEntries} />}

                    {activeTab === 'basis' && (
                        <BasisTab
                            tenancy={tenancy}
                            unit={unit}
                            property={property}
                            onChange={data.updateBasisField}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

// ── Aktuelle Vorschläge ──────────────────────────────────────────────────

function ProposalCardShell({
    icon: Icon,
    title,
    status,
    statusVariant,
    children,
}: {
    icon: React.ElementType;
    title: string;
    status: string;
    statusVariant: 'warning' | 'danger';
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                </div>
                <Tag label={status} variant={statusVariant} size="sm" />
            </div>
            <div className="p-4 flex flex-col gap-3">{children}</div>
        </div>
    );
}

function RentIncreaseCard({
    tenancy, proposal, isResolving, editing, onEdit, onCancelEdit, onSaveAmount, onAccept, onDefer, onDecline,
}: {
    tenancy: import('@immoandthebrain/types').Tenancy;
    proposal: import('./rentDevelopmentPlan').Proposal558Result;
    isResolving: boolean;
    editing: boolean;
    onEdit: () => void;
    onCancelEdit: () => void;
    onSaveAmount: (amount: number | null) => Promise<void>;
    onAccept: () => void;
    onDefer: () => void;
    onDecline: () => void;
}) {
    const [draft, setDraft] = useState(String(proposal.proposedAmount));
    const newRent = (tenancy.coldRent ?? 0) + proposal.proposedAmount;
    const increasePercent = tenancy.coldRent ? (proposal.proposedAmount / tenancy.coldRent) * 100 : 0;

    return (
        <ProposalCardShell
            icon={Icons.TrendingUp}
            title="Mietanpassung – Vergleichsmietenerhöhung"
            status={proposal.exceedsLegalMax ? 'Wert überschritten' : 'Ausstehend'}
            statusVariant={proposal.exceedsLegalMax ? 'danger' : 'warning'}
        >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vorschlag Datum</p>
                    <p className="font-medium text-foreground">{formatDeDate(tenancy.nextRentAdjustmentDate ?? proposal.earliestEffectiveDate)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vorgeschlagene Erhöhung</p>
                    <p className="font-medium text-foreground">+{euro(proposal.proposedAmount)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Neue Nettomiete</p>
                    <p className="font-medium text-foreground">{euro(newRent)} <span className="text-xs text-success">+{increasePercent.toFixed(1)}% Steigerung</span></p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Erinnerung</p>
                    <p className="font-medium text-foreground">{formatDeDate(tenancy.rentAdjustmentReminderDate)}</p>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Grundlage: §558 BGB, ortsübliche Vergleichsmiete{tenancy.rentIndexPerM2 != null ? ` ${tenancy.rentIndexPerM2.toLocaleString('de-DE')} €/m²` : ' – noch nicht hinterlegt'}
                {proposal.denseMarket ? ' (angespannter Wohnungsmarkt, 15% Kappungsgrenze)' : ' (20% Kappungsgrenze)'}
            </p>

            {proposal.exceedsLegalMax && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                    <Icons.AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        Der manuell eingetragene Wert ({euro(proposal.proposedAmount)}) überschreitet den gesetzlich zulässigen Rahmen
                        (§558 BGB). Der Kalkulator empfiehlt maximal {euro(proposal.legalMaxAmount)}.
                    </span>
                </div>
            )}

            {editing ? (
                <div className="flex items-end gap-2">
                    <div className="w-40">
                        <NumberField label="Wert manuell anpassen" unit="€" value={draft} onChange={(e) => setDraft(e.target.value)} min={0} hideStepper />
                    </div>
                    <Button label="Speichern" variant="primary" size="sm" onClick={() => void onSaveAmount(draft !== '' ? Number(draft) : null)} />
                    <Button label="Abbrechen" variant="outline" size="sm" onClick={onCancelEdit} />
                </div>
            ) : (
                <div className="flex items-center justify-end gap-2 flex-wrap">
                    <Button label="Ablehnen" icon={<Icons.X className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onDecline} />
                    <Button label="Auf Folgemonat verschieben" icon={<Icons.Clock className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onDefer} />
                    <Button label="Wert manuell anpassen" icon={<Icons.Rename className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onEdit} />
                    <Button label="Übernehmen" icon={<Icons.Check className="w-4 h-4" />} variant="primary" size="sm" disabled={isResolving} onClick={onAccept} />
                </div>
            )}
        </ProposalCardShell>
    );
}

function RenovationCard({
    tenancy, proposal, isResolving, editing, onEdit, onCancelEdit, onSaveAmount, onAccept, onDefer, onDecline,
}: {
    tenancy: import('@immoandthebrain/types').Tenancy;
    proposal: import('./rentDevelopmentPlan').Proposal559Result;
    isResolving: boolean;
    editing: boolean;
    onEdit: () => void;
    onCancelEdit: () => void;
    onSaveAmount: (amount: number | null) => Promise<void>;
    onAccept: () => void;
    onDefer: () => void;
    onDecline: () => void;
}) {
    const [draft, setDraft] = useState(String(proposal.proposedAmount));
    const newRent = (tenancy.coldRent ?? 0) + proposal.recommendedAmount;
    const period = tenancy.renovationAdjustmentStartDate && tenancy.renovationAdjustmentEndDate
        ? `${formatDeDate(tenancy.renovationAdjustmentStartDate)} – ${formatDeDate(tenancy.renovationAdjustmentEndDate)}`
        : formatDeDate(tenancy.renovationAdjustmentStartDate);

    return (
        <ProposalCardShell
            icon={Icons.Wrench}
            title="Sanierungsanpassung – Modernisierungsmieterhöhung"
            status={proposal.exceedsLegalMax ? 'Wert überschritten' : 'Ausstehend'}
            statusVariant={proposal.exceedsLegalMax ? 'danger' : 'warning'}
        >
            {proposal.exceedsLegalMax && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                    <Icons.AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        Der manuell eingetragene Wert für die Sanierungsanpassung ({euro(proposal.proposedAmount)}) überschreitet den gesetzlich
                        zulässigen Rahmen (§559 BGB, max. 8% der Sanierungskosten p.a., gedeckelt auf {proposal.capPerM2} €/m² über 6 Jahre).
                        Der Kalkulator empfiehlt maximal {euro(proposal.recommendedAmount)}.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Sanierung</p>
                    <p className="font-medium text-foreground">{period}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Eingetragener Erhöhung</p>
                    <p className={cn("font-medium", proposal.exceedsLegalMax ? "text-destructive" : "text-foreground")}>
                        {euro(proposal.proposedAmount)} {proposal.exceedsLegalMax && <span className="text-xs">Über gesetzl. Grenze</span>}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Empfohlene Erhöhung</p>
                    <p className="font-medium text-success">+{euro(proposal.recommendedAmount)} <span className="text-xs">§559 BGB konform</span></p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Neue Nettomiete (empf.)</p>
                    <p className="font-medium text-foreground">{euro(newRent)} <span className="text-xs text-muted-foreground">nach Mietanpassung</span></p>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Grundlage: Sanierungskosten {tenancy.plannedRenovationCost != null ? euro(tenancy.plannedRenovationCost) : 'noch nicht hinterlegt'}
            </p>

            {editing ? (
                <div className="flex items-end gap-2">
                    <div className="w-40">
                        <NumberField label="Wert manuell anpassen" unit="€" value={draft} onChange={(e) => setDraft(e.target.value)} min={0} hideStepper />
                    </div>
                    <Button label="Speichern" variant="primary" size="sm" onClick={() => void onSaveAmount(draft !== '' ? Number(draft) : null)} />
                    <Button label="Abbrechen" variant="outline" size="sm" onClick={onCancelEdit} />
                </div>
            ) : (
                <div className="flex items-center justify-end gap-2 flex-wrap">
                    <Button label="Ablehnen" icon={<Icons.X className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onDecline} />
                    <Button label="Auf Folgemonat verschieben" icon={<Icons.Clock className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onDefer} />
                    <Button label="Wert manuell anpassen" icon={<Icons.Rename className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onEdit} />
                    <Button
                        label={`Empfehlung übernehmen (${euro(proposal.recommendedAmount)})`}
                        icon={<Icons.Check className="w-4 h-4" />}
                        variant="primary"
                        size="sm"
                        disabled={isResolving}
                        onClick={onAccept}
                    />
                </div>
            )}
        </ProposalCardShell>
    );
}

// ── Zeitplan & Fristen ───────────────────────────────────────────────────

function ScheduleTab({
    tenancy, history,
}: {
    tenancy: import('@immoandthebrain/types').Tenancy;
    history: import('@immoandthebrain/types').TenancyAdjustmentHistoryEntry[];
}) {
    const upcoming = [
        tenancy.rentAdjustmentReminderDate && { date: tenancy.rentAdjustmentReminderDate, label: 'Erinnerung: Mietanpassung (§558)' },
        tenancy.nextRentAdjustmentDate && { date: tenancy.nextRentAdjustmentDate, label: 'Frist: Mietanpassung wirksam (§558)' },
        tenancy.renovationAdjustmentReminderDate && { date: tenancy.renovationAdjustmentReminderDate, label: 'Erinnerung: Sanierungsanpassung (§559)' },
        tenancy.renovationAdjustmentStartDate && { date: tenancy.renovationAdjustmentStartDate, label: 'Frist: Sanierungsanpassung wirksam (§559)' },
    ].filter((entry): entry is { date: string; label: string } => Boolean(entry))
        .sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="flex flex-col gap-6">
            <div>
                <SectionLabel>Anstehend</SectionLabel>
                {upcoming.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Keine anstehenden Fristen.</p>
                ) : (
                    <div className="mt-3 flex flex-col gap-2">
                        {upcoming.map((entry) => (
                            <div key={`${entry.date}-${entry.label}`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                                <span className="text-sm text-foreground">{entry.label}</span>
                                <span className="text-sm font-medium text-muted-foreground">{formatDeDate(entry.date)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <SectionLabel>Verlauf</SectionLabel>
                {history.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Noch keine Anpassungen erfasst.</p>
                ) : (
                    <div className="mt-3 flex flex-col gap-2">
                        {history.map((entry) => (
                            <div key={entry.historyId} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                                <div className="flex items-center gap-2">
                                    <Tag label={entry.adjustmentType === 'rent' ? '§558' : entry.adjustmentType === 'renovation' ? '§559' : entry.adjustmentType} variant="muted" size="sm" />
                                    <span className="text-sm text-foreground">{entry.note ?? '–'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    {entry.amount != null && <span>+{euro(entry.amount)}</span>}
                                    <span>{formatDeDate(entry.effectiveDate)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Kalkulationsbasis ────────────────────────────────────────────────────

function BasisTab({
    tenancy, unit, property, onChange,
}: {
    tenancy: import('@immoandthebrain/types').Tenancy;
    unit: import('@immoandthebrain/types').PropertyUnit;
    property: import('@immoandthebrain/types').Property;
    onChange: (field: 'rentIndexPerM2' | 'rentIncreaseIntervalMonths' | 'plannedRenovationCost', value: number | null) => Promise<void>;
}) {
    const [rentIndex, setRentIndex] = useState(tenancy.rentIndexPerM2 != null ? String(tenancy.rentIndexPerM2) : '');
    const [interval, setInterval_] = useState(tenancy.rentIncreaseIntervalMonths != null ? String(tenancy.rentIncreaseIntervalMonths) : '');
    const [renovationCost, setRenovationCost] = useState(tenancy.plannedRenovationCost != null ? String(tenancy.plannedRenovationCost) : '');

    return (
        <div className="flex flex-col gap-6">
            <div>
                <SectionLabel>Bekannte Werte (übernommen)</SectionLabel>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Wohnfläche</p>
                        <p className="font-medium text-foreground">{unit.livingAreaM2 ?? '–'} m²</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Aktuelle Nettomiete</p>
                        <p className="font-medium text-foreground">{euro(tenancy.coldRent ?? 0)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Stadt</p>
                        <p className="font-medium text-foreground">{property.city}</p>
                    </div>
                </div>
            </div>

            <div>
                <SectionLabel>Eingaben für die Berechnung</SectionLabel>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <NumberField
                        label="Vergleichsmietenindex"
                        optional
                        unit="€/m²"
                        step="0.01"
                        value={rentIndex}
                        onChange={(e) => setRentIndex(e.target.value)}
                        onBlur={() => void onChange('rentIndexPerM2', rentIndex !== '' ? Number(rentIndex) : null)}
                        min={0}
                        hideStepper
                    />
                    <NumberField
                        label="Sperrfrist §558"
                        optional
                        unit="Monate"
                        value={interval}
                        onChange={(e) => setInterval_(e.target.value)}
                        onBlur={() => void onChange('rentIncreaseIntervalMonths', interval !== '' ? Number(interval) : null)}
                        min={15}
                        max={60}
                    />
                    <NumberField
                        label="Geplante Sanierungskosten"
                        optional
                        unit="€"
                        value={renovationCost}
                        onChange={(e) => setRenovationCost(e.target.value)}
                        onBlur={() => void onChange('plannedRenovationCost', renovationCost !== '' ? Number(renovationCost) : null)}
                        min={0}
                        hideStepper
                    />
                </div>
            </div>
        </div>
    );
}
