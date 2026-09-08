"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { DataCard } from '../tenant-data/DocumentGeneratorParts';
import {
    Button,
    CalendarField,
    Header,
    Icons,
    LoadingScreen,
    MetricCard,
    PAGE_CONTAINER_CLASS,
    NumberField,
    SectionLabel,
    StickyActionBar,
    Switch,
    TextField,
    type BreadcrumbItem,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import type { Property, PropertyUnit } from '@immonext/types';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import { euro, useServiceChargeSettlementData } from './useServiceChargeSettlementData';

interface ServiceChargeSettlementViewProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
}

export function ServiceChargeSettlementView({ propertyId, property, unit, hasMultipleUnits }: ServiceChargeSettlementViewProps) {
    const data = useServiceChargeSettlementData(propertyId, property, unit, hasMultipleUnits);
    const router = useRouter();
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);

    const breadcrumbItems: BreadcrumbItem[] = hasMultipleUnits
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: address, href: `/existing-properties/${propertyId}` },
            { label: unitLabel, href: `/existing-properties/${propertyId}/${unit.propertyUnitId}` },
            { label: ExistingPropertiesUseCases.ServiceChargeSettlement },
        ]
        : [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: address, href: `/existing-properties/${propertyId}` },
            { label: ExistingPropertiesUseCases.ServiceChargeSettlement },
        ];

    if (data.isLoading) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={breadcrumbItems}                    actions={
                        <Button
                            label={BUTTON_DETAILS.UseCases.label}
                            icon={<BUTTON_DETAILS.UseCases.icon />}
                            variant="outline"
                            hideLabelOnMobile
                            menuItems={data.useCaseMenuItems}
                        />
                    }
                />

                <div className="space-y-6">
                    {data.error && (
                        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                            {data.error}
                        </div>
                    )}

                    {/* Abrechnungszeitraum */}
                    <div>
                        <SectionLabel>Abrechnungszeitraum & Kostenpositionen</SectionLabel>
                        <div className="mt-3">
                            <Switch
                                label="Individueller Zeitraum"
                                checked={data.periodMode === 'custom'}
                                onCheckedChange={(checked) => data.setPeriodMode(checked ? 'custom' : 'year')}
                            />
                        </div>
                        {data.periodMode === 'year' ? (
                            <div className="mt-3 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => data.setSettlementYear(data.settlementYear - 1)}
                                    aria-label="Vorheriges Jahr"
                                    className="p-2 rounded-md border border-primary/30 text-muted-foreground hover:border-primary/55 hover:text-foreground transition-colors cursor-pointer"
                                >
                                    <Icons.ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="min-w-24 px-4 py-2 rounded-md border border-primary/30 bg-card text-center text-sm font-semibold text-foreground">
                                    Abrechnungsjahr {data.settlementYear}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => data.setSettlementYear(data.settlementYear + 1)}
                                    aria-label="Nächstes Jahr"
                                    className="p-2 rounded-md border border-primary/30 text-muted-foreground hover:border-primary/55 hover:text-foreground transition-colors cursor-pointer"
                                >
                                    <Icons.ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="mt-3 flex items-end gap-3">
                                <div className="w-40">
                                    <CalendarField label="Von" value={data.periodStart} onChange={data.setPeriodStart} />
                                </div>
                                <span className="pb-2.5 text-sm text-muted-foreground">bis</span>
                                <div className="w-40">
                                    <CalendarField label="Bis" value={data.periodEnd} onChange={data.setPeriodEnd} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricCard
                            label="Gesamtkosten Objekt"
                            value={euro(data.totalActualCostsAll)}
                            detail={`Abrechnungsjahr ${data.settlementYear}`}
                        />
                        <MetricCard
                            label={`Anteil ${unitLabel}`}
                            value={euro(data.unitActualShare)}
                            detail={`Vorauszahlung: ${euro(data.annualPrepayment)}`}
                        />
                        <MetricCard
                            label="Über-/Unterdeckung"
                            value={`${data.overUnderCoverage < 0 ? '-' : '+'}${euro(Math.abs(data.overUnderCoverage))}`}
                            detail={data.settlementCoverage === 'shortfall' ? 'Nachzahlung durch Mieter' : 'Guthaben des Mieters'}
                            tone={data.settlementCoverage === 'shortfall' ? 'warning' : 'positive'}
                        />
                    </div>

                    <input
                        ref={uploadInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="sr-only"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void data.handleUploadSourceDocument(file);
                        }}
                    />

                    {data.settlement?.sourceDocumentName ? (
                        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                                <Icons.FileText className="w-5 h-5 text-success shrink-0" />
                                <div className="min-w-0 text-left">
                                    <button
                                        type="button"
                                        onClick={() => void data.handleViewSourceDocument()}
                                        className="block text-sm font-medium text-foreground hover:underline cursor-pointer truncate"
                                    >
                                        {data.settlement.sourceDocumentName}
                                    </button>
                                    <p className="text-xs text-muted-foreground">Hochgeladen</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Button
                                    label="Ersetzen"
                                    icon={<Icons.RefreshCw className="w-4 h-4" />}
                                    variant="outline"
                                    size="sm"
                                    disabled={data.isUploadingSource}
                                    onClick={() => uploadInputRef.current?.click()}
                                />
                                <button
                                    type="button"
                                    onClick={() => void data.handleRemoveSourceDocument()}
                                    disabled={data.isUploadingSource}
                                    aria-label="Datei entfernen"
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Icons.Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <Button
                                label="Nebenkostenabrechnung hochladen"
                                icon={<Icons.Upload className="w-4 h-4" />}
                                variant="outline"
                                disabled={data.isUploadingSource}
                                onClick={() => uploadInputRef.current?.click()}
                                className="w-full mb-3"
                            />
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-xs text-muted-foreground shrink-0">oder manuell erfassen</span>
                                <div className="flex-1 h-px bg-border" />
                            </div>
                        </div>
                    )}

                    {/* Info banner */}
                    <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-foreground">
                        Erfasse alle Kostenpositionen des Abrechnungsjahres. Die Wohnungsanteile und der Wirtschaftsplan werden automatisch berechnet, können bei Bedarf pro Position aber manuell angepasst werden. Fehlende Werte im Wirtschaftsplan kannst du manuell ergänzen.
                    </div>

                    {/* Cost item table */}
                    <div className="flex justify-end">
                        <Button
                            label="Kostenposition hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            onClick={data.addCostItem}
                        />
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-primary/8 border-b border-border">
                                        <th rowSpan={2} className="px-3 py-2 text-left align-bottom font-semibold text-foreground whitespace-nowrap">Kostenposition</th>
                                        <th colSpan={2} className="px-3 py-2 text-center font-semibold text-primary border-l border-border whitespace-nowrap">Abrechnung {data.settlementYear}</th>
                                        <th colSpan={2} className="px-3 py-2 text-center font-semibold text-primary border-l border-border whitespace-nowrap">Wirtschaftsplan {data.settlementYear + 1}</th>
                                        <th rowSpan={2} className="w-10"></th>
                                    </tr>
                                    <tr className="bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                                        <th className="px-3 py-2 text-right border-l border-border whitespace-nowrap">Gesamt Objekt</th>
                                        <th className="px-3 py-2 text-right whitespace-nowrap">Anteil Wohnung</th>
                                        <th className="px-3 py-2 text-right border-l border-border whitespace-nowrap">Gesamt Objekt</th>
                                        <th className="px-3 py-2 text-right whitespace-nowrap">Anteil Wohnung</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {data.costItems.map((item, index) => (
                                        <tr key={item.id ?? `new-${index}`}>
                                            <td className="px-3 py-2 min-w-[220px]">
                                                <TextField
                                                    value={item.label}
                                                    placeholder="Bezeichnung"
                                                    onChange={(e) => data.updateCostItemField(index, { label: e.target.value })}
                                                />
                                                <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer w-fit">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.allocable}
                                                        onChange={(e) => data.updateCostItemField(index, { allocable: e.target.checked })}
                                                    />
                                                    umlagefähig
                                                </label>
                                            </td>
                                            <td className="px-3 py-2 border-l border-border w-36">
                                                <NumberField
                                                    unit="€"
                                                    placeholder="–"
                                                    value={item.actualAmount}
                                                    onChange={(e) => data.updateCostItemField(index, { actualAmount: e.target.value })}
                                                    min={0}
                                                />
                                            </td>
                                            <td className="px-3 py-2 w-36">
                                                <NumberField
                                                    unit="€"
                                                    placeholder="–"
                                                    value={item.actualShareOverride !== '' ? item.actualShareOverride : (data.actualShareForItem(item) != null ? String(data.actualShareForItem(item)) : '')}
                                                    onChange={(e) => data.updateCostItemField(index, { actualShareOverride: e.target.value })}
                                                    disabled={!item.allocable || item.actualAmount === ''}
                                                    min={0}
                                                />
                                                {item.actualShareOverride !== '' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => data.updateCostItemField(index, { actualShareOverride: '' })}
                                                        className="mt-1 text-xs text-primary hover:underline cursor-pointer"
                                                    >
                                                        Automatisch berechnen
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 border-l border-border w-36">
                                                <NumberField
                                                    unit="€"
                                                    placeholder="–"
                                                    value={item.budgetAmount}
                                                    onChange={(e) => data.updateCostItemField(index, { budgetAmount: e.target.value })}
                                                    min={0}
                                                />
                                            </td>
                                            <td className="px-3 py-2 w-36">
                                                <NumberField
                                                    unit="€"
                                                    placeholder="–"
                                                    value={item.budgetShareOverride !== '' ? item.budgetShareOverride : (data.budgetShareForItem(item) != null ? String(data.budgetShareForItem(item)) : '')}
                                                    onChange={(e) => data.updateCostItemField(index, { budgetShareOverride: e.target.value })}
                                                    disabled={!item.allocable || item.budgetAmount === ''}
                                                    min={0}
                                                />
                                                {item.budgetShareOverride !== '' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => data.updateCostItemField(index, { budgetShareOverride: '' })}
                                                        className="mt-1 text-xs text-primary hover:underline cursor-pointer"
                                                    >
                                                        Automatisch berechnen
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-2 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => data.removeCostItem(index)}
                                                    aria-label="Kostenposition entfernen"
                                                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                                >
                                                    <Icons.Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-border font-semibold">
                                        <td className="px-3 py-2">Summe</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.totalActualCostsAll)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitActualShare)}</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.totalBudgetCostsAll)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitBudgetShare)}</td>
                                        <td></td>
                                    </tr>
                                    <tr className="text-primary">
                                        <td className="px-3 py-2">Vorauszahlungen Mieter</td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.annualPrepayment)}</td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.annualPrepayment)}</td>
                                        <td></td>
                                    </tr>
                                    <tr className={data.settlementCoverage === 'shortfall' ? 'text-destructive' : 'text-success'}>
                                        <td className="px-3 py-2 font-medium">
                                            {data.settlementCoverage === 'shortfall' ? 'Nachzahlung durch Mieter' : 'Guthaben durch Mieter'}
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            {data.overUnderCoverage < 0 ? '-' : '+'}{euro(Math.abs(data.overUnderCoverage))}
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap text-warning">
                                            {data.prepaymentDelta != null ? `${data.prepaymentDelta >= 0 ? '+' : '-'}${euro(Math.abs(data.prepaymentDelta))}` : '–'}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Service charge prepayment adjustment */}
                    <div>
                        <SectionLabel>Anpassung Nebenkostenvorauszahlung</SectionLabel>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <MetricCard
                                label="NK-Vorauszahlung aktuell"
                                value={`${euro(data.currentMonthlyPrepayment)}`}
                                detail="/Monat"
                            />
                            <MetricCard
                                label="NK-Vorauszahlung neu"
                                value={data.newMonthlyPrepayment != null ? euro(data.newMonthlyPrepayment) : '–'}
                                detail={data.budgetCoverage === 'shortfall' ? 'Erhöhung wegen Unterdeckung' : data.budgetCoverage === 'surplus' ? 'Reduzierung wegen Überdeckung' : `aus Wirtschaftsplan ${data.settlementYear + 1}`}
                                tone={data.budgetCoverage === 'shortfall' ? 'warning' : 'positive'}
                            />
                            <MetricCard
                                label="Neue Gesamtmiete"
                                value={euro(data.newTotalRent)}
                                detail={`inkl. ${euro(data.tenancy?.coldRent)} Nettomiete`}
                            />
                        </div>
                        <div className="mt-3 flex justify-end">
                            <Button
                                label="Neue NK-Vorauszahlung übernehmen"
                                icon={<Icons.RefreshCw className="w-4 h-4" />}
                                variant="outline"
                                disabled={!data.canApplyPrepayment || data.isApplyingPrepayment}
                                onClick={() => void data.handleApplyPrepayment()}
                            />
                        </div>
                    </div>

                    {/* Generatable documents */}
                    <div>
                        <SectionLabel>Generierbare Dokumente</SectionLabel>
                        <div className="mt-3">
                            <DataCard
                                icon={Icons.FileText}
                                title="Nebenkostenabrechnung als PDF"
                                footer={
                                    <>
                                        <span title={!data.canGeneratePdf ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label="Daten prüfen & Vorschau"
                                                icon={<Icons.Eye className="w-4 h-4" />}
                                                variant="outline"
                                                disabled={!data.canGeneratePdf}
                                                onClick={() => router.push(`/existing-properties/${propertyId}/service-charge-settlement/${unit.propertyUnitId}/statement`)}
                                            />
                                        </span>
                                        <span title={!data.canGeneratePdf ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label="PDF generieren"
                                                icon={<Icons.FileText className="w-4 h-4" />}
                                                variant="primary"
                                                disabled={!data.canGeneratePdf || data.isGeneratingPdf}
                                                onClick={() => void data.handleGeneratePdf()}
                                            />
                                        </span>
                                    </>
                                }
                            >
                                <p className="text-xs text-muted-foreground">
                                    Vollständige Abrechnung inkl. Wirtschaftsplan und NK-Anpassung
                                </p>
                            </DataCard>
                        </div>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(data.backHref)}
                onPrimary={() => void data.handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel="Abrechnung speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!data.isEditing || data.isSaving}
            />
        </div>
    );
}
