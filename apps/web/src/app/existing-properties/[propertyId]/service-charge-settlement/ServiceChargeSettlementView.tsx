"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { DataCard, DocumentBox, DocumentReplaceModal, DocumentUploadButton } from '../tenant-data/DocumentGeneratorParts';
import {
    Button,
    CalendarField,
    ConfirmDeleteModal,
    DetailFieldLegend,
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
    UnsavedChangesModal,
    type BreadcrumbItem,
    type MenuItem,
} from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { isFullCalendarYear } from '@/lib/serviceCharge/settlementMath';
import { cn, formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit, ServiceChargeSettlement } from '@immoandthebrain/types';
import { useMemo, useRef } from 'react';
import { Sparkles } from 'lucide-react';

import { euro, useServiceChargeSettlementData } from './useServiceChargeSettlementData';

function settlementPeriodLabel(s: ServiceChargeSettlement): string {
    const start = new Date(s.periodStart);
    const end = new Date(s.periodEnd);
    return isFullCalendarYear(start, end) ? `Abrechnungsjahr ${end.getFullYear()}` : `${formatDeDate(s.periodStart)} – ${formatDeDate(s.periodEnd)}`;
}

interface ServiceChargeSettlementViewProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
}

export function ServiceChargeSettlementView({ propertyId, property, unit, hasMultipleUnits }: ServiceChargeSettlementViewProps) {
    const data = useServiceChargeSettlementData(propertyId, property, unit, hasMultipleUnits);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);

    const breadcrumbItems: BreadcrumbItem[] = hasMultipleUnits
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties', onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } } },
            { label: address, href: `/existing-properties/${propertyId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } } },
            { label: unitLabel, href: `/existing-properties/${propertyId}/${unit.propertyUnitId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}/${unit.propertyUnitId}`); } } },
            { label: ExistingPropertiesUseCases.ServiceChargeSettlement },
        ]
        : [
            { label: 'Bestandsobjekte', href: '/existing-properties', onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } } },
            { label: address, href: `/existing-properties/${propertyId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } } },
            { label: ExistingPropertiesUseCases.ServiceChargeSettlement },
        ];

    // Reopens a previously saved settlement whose period isn't reachable via
    // the year chevron (a custom range, or simply a year other than the one
    // currently loaded) — the only browse path for "Individueller Zeitraum".
    const savedSettlementMenuItems: MenuItem[] = useMemo(() => data.savedSettlements.map((s) => ({
        label: settlementPeriodLabel(s),
        icon: data.settlement?.serviceChargeSettlementId === s.serviceChargeSettlementId ? <Icons.Check /> : undefined,
        onClick: () => data.switchToPeriod(new Date(s.periodStart), new Date(s.periodEnd)),
    })), [data]);

    if (data.isLoading) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={breadcrumbItems}
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
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                            <Switch
                                label="Individueller Zeitraum"
                                checked={data.periodMode === 'custom'}
                                onCheckedChange={(checked) => data.setPeriodMode(checked ? 'custom' : 'year')}
                            />
                            <div className="flex items-center gap-2">
                                {savedSettlementMenuItems.length > 0 && (
                                    <Button
                                        label="Gespeicherte Abrechnungen"
                                        icon={<Icons.History className="w-4 h-4" />}
                                        variant="outline"
                                        size="sm"
                                        menuItems={savedSettlementMenuItems}
                                    />
                                )}
                                {data.settlement && (
                                    <Button
                                        label="Abrechnung löschen"
                                        icon={<Icons.Trash2 className="w-4 h-4" />}
                                        variant="outline"
                                        size="sm"
                                        className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={data.requestDeleteSettlement}
                                    />
                                )}
                            </div>
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
                                {data.tenancyPeriodSuggestions.length > 0 && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label="Mietzeitraum übernehmen"
                                                title="Mietzeitraum eines Mieters übernehmen"
                                                className="h-[42px] w-[42px] flex items-center justify-center rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                                            >
                                                <Icons.User className="w-4 h-4" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2" align="end">
                                            <p className="px-2 pt-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                Mietzeitraum übernehmen
                                            </p>
                                            <div className="flex flex-col gap-1">
                                                {data.tenancyPeriodSuggestions.map((suggestion) => (
                                                    <button
                                                        key={suggestion.tenancyId}
                                                        type="button"
                                                        onClick={() => data.applyTenancyPeriodSuggestion(suggestion)}
                                                        className="flex flex-col items-start gap-0.5 px-3 py-2 text-sm rounded-md text-left cursor-pointer hover:bg-muted focus:bg-muted focus:outline-none transition-colors"
                                                    >
                                                        <span className="font-medium text-foreground">{suggestion.label}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDeDate(suggestion.startDateStr)} – {formatDeDate(suggestion.endDateStr)}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricCard
                            label="Kosten Objekt (umlagefähig)"
                            value={euro(data.totalActualAllocable)}
                            detail={`zzgl. ${euro(data.actualSplit.nonAllocable)} nicht umlagefähig`}
                        />
                        <MetricCard
                            label={`Anteil ${unitLabel}`}
                            value={euro(data.unitActualShare)}
                            detail={data.tenancy ? `Vorauszahlung: ${euro(data.annualPrepayment)}` : 'Kein Mieter zu diesem Zeitraum'}
                        />
                        <MetricCard
                            label="Über-/Unterdeckung"
                            value={!data.tenancy ? '–' : euro(Math.abs(data.overUnderCoverage))}
                            detail={
                                !data.tenancy ? 'Nachzahlung/Guthaben ohne Mieter nicht anwendbar'
                                    : data.settlementCoverage === 'shortfall' ? 'Nachzahlung durch Mieter'
                                        : data.settlementCoverage === 'surplus' ? 'Guthaben des Mieters'
                                            : 'Ausgeglichen'
                            }
                            tone={!data.tenancy ? 'neutral' : data.settlementCoverage === 'shortfall' ? 'warning' : data.settlementCoverage === 'surplus' ? 'positive' : 'neutral'}
                            colorValue
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

                    {data.isExtractingSettlement && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3 text-sm text-foreground">
                            <Icons.Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                            Daten werden aus dem Dokument übernommen …
                        </div>
                    )}

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
                                    disabled={data.isUploadingSource || data.isExtractingSettlement}
                                    onClick={() => uploadInputRef.current?.click()}
                                />
                                <button
                                    type="button"
                                    onClick={() => void data.handleRemoveSourceDocument()}
                                    disabled={data.isUploadingSource || data.isExtractingSettlement}
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
                                disabled={data.isUploadingSource || data.isExtractingSettlement}
                                onClick={() => uploadInputRef.current?.click()}
                                className="w-full mb-3"
                            />
                            <div className="flex items-start gap-2 -mt-2 mb-3 px-3 py-2 rounded-md bg-info/10 border border-info/30 text-xs text-info">
                                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>
                                    Automatische Übernahme von Kostenpositionen und Zeitraum per KI ist demnächst verfügbar.
                                    Bitte die Werte nach dem Hochladen noch manuell erfassen.
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-xs text-muted-foreground shrink-0">oder manuell erfassen</span>
                                <div className="flex-1 h-px bg-border" />
                            </div>
                        </div>
                    )}

                    {/* Info banner */}
                    <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-foreground">
                        Erfasse alle Kostenpositionen des Abrechnungsjahres sowie den jeweiligen Wohnungsanteil pro Position — der Gesamtbetrag des Objekts entspricht nicht automatisch dem Anteil der Wohnung und muss separat erfasst werden. Über „Wert vorschlagen&quot; kannst du dir pro Position einen Vorschlag auf Basis von Wohnflächenanteil und Mietzeitraum anzeigen lassen und bei Bedarf anpassen.
                    </div>

                    {/* Cost item table */}
                    <div className="flex justify-end gap-2">
                        <Button
                            label="Alle Werte vorschlagen"
                            icon={<Icons.Calculator className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            disabled={!data.canSuggestShares || !data.costItems.some((item) => item.actualAmount !== '' || item.budgetAmount !== '')}
                            onClick={data.suggestAllShares}
                            title={!data.canSuggestShares
                                ? 'NK-Vorauszahlung und WEG müssen im Mietvertrag ausgefüllt sein, bevor ein Anteil Wohnung vorgeschlagen werden kann.'
                                : 'Füllt Anteil Wohnung für jede Position mit Gesamtbetrag, die noch leer ist — bereits erfasste Werte bleiben unverändert.'}
                        />
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
                                    {data.costItems.map((item, index) => {
                                        const actualShareExceedsTotal = item.actualAmount !== '' && item.actualShareOverride !== '' && Number(item.actualShareOverride) > Number(item.actualAmount);
                                        const budgetShareExceedsTotal = item.budgetAmount !== '' && item.budgetShareOverride !== '' && Number(item.budgetShareOverride) > Number(item.budgetAmount);
                                        // Gesamtobjekt and Anteil Wohnung are a pair, per column — filling
                                        // one without the other is always an incomplete entry, never a
                                        // valid state to save.
                                        const actualPairIncomplete = (item.actualAmount !== '') !== (item.actualShareOverride !== '');
                                        const budgetPairIncomplete = (item.budgetAmount !== '') !== (item.budgetShareOverride !== '');
                                        const actualAmountMissing = actualPairIncomplete && item.actualAmount === '';
                                        const budgetAmountMissing = budgetPairIncomplete && item.budgetAmount === '';
                                        const actualShareIssue = actualShareExceedsTotal
                                            ? 'Anteil Wohnung ist höher als Gesamtobjekt'
                                            : actualPairIncomplete && item.actualShareOverride === ''
                                                ? 'Anteil Wohnung fehlt'
                                                : null;
                                        const budgetShareIssue = budgetShareExceedsTotal
                                            ? 'Anteil Wohnung ist höher als Gesamtobjekt'
                                            : budgetPairIncomplete && item.budgetShareOverride === ''
                                                ? 'Anteil Wohnung fehlt'
                                                : null;
                                        return (
                                        <tr key={item.id ?? `new-${index}`}>
                                            <td className="px-3 py-2 min-w-[220px] align-top">
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
                                            <td className="px-3 py-2 border-l border-border w-36 align-top">
                                                <div className="relative">
                                                    <NumberField
                                                        placeholder="–"
                                                        value={item.actualAmount}
                                                        onChange={(e) => data.updateCostItemField(index, { actualAmount: e.target.value })}
                                                        min={0}
                                                        hideStepper
                                                        className={cn('pr-11', actualAmountMissing && 'border-destructive focus:ring-destructive/50')}
                                                        aria-invalid={actualAmountMissing}
                                                        title={actualAmountMissing ? 'Gesamtobjekt-Betrag fehlt' : undefined}
                                                    />
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                        <span className="w-4 text-center text-muted-foreground text-xs">€</span>
                                                        <span className="inline-block w-[22px] h-[22px]" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 w-36 align-top">
                                                <div className="relative">
                                                    <NumberField
                                                        placeholder="–"
                                                        value={item.actualShareOverride}
                                                        onChange={(e) => data.updateCostItemField(index, { actualShareOverride: e.target.value })}
                                                        min={0}
                                                        hideStepper
                                                        className={cn('pr-11', actualShareIssue && 'border-destructive focus:ring-destructive/50')}
                                                        aria-invalid={!!actualShareIssue}
                                                    />
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                        {actualShareIssue ? (
                                                            <span className="w-4 flex justify-center" title={actualShareIssue}>
                                                                <Icons.AlertTriangle className="w-3.5 h-3.5 text-destructive" aria-label={actualShareIssue} />
                                                            </span>
                                                        ) : (
                                                            <span className="w-4 text-center text-muted-foreground text-xs">€</span>
                                                        )}
                                                        <span className="inline-flex items-center justify-center w-[22px] h-[22px]">
                                                            {data.canSuggestShares && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => data.suggestRowShare(index, 'actual')}
                                                                    disabled={item.actualAmount === ''}
                                                                    aria-label="Wert vorschlagen"
                                                                    title="Wert vorschlagen: NK-Vorauszahlung ÷ WEG × Mietzeitraum (nur dieses Feld)"
                                                                    className="p-0.5 rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                                >
                                                                    <Icons.Calculator className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 border-l border-border w-36 align-top">
                                                <div className="relative">
                                                    <NumberField
                                                        placeholder="–"
                                                        value={item.budgetAmount}
                                                        onChange={(e) => data.updateCostItemField(index, { budgetAmount: e.target.value })}
                                                        min={0}
                                                        hideStepper
                                                        className={cn('pr-11', budgetAmountMissing && 'border-destructive focus:ring-destructive/50')}
                                                        aria-invalid={budgetAmountMissing}
                                                        title={budgetAmountMissing ? 'Gesamtobjekt-Betrag fehlt' : undefined}
                                                    />
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                        <span className="w-4 text-center text-muted-foreground text-xs">€</span>
                                                        <span className="inline-block w-[22px] h-[22px]" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 w-36 align-top">
                                                <div className="relative">
                                                    <NumberField
                                                        placeholder="–"
                                                        value={item.budgetShareOverride}
                                                        onChange={(e) => data.updateCostItemField(index, { budgetShareOverride: e.target.value })}
                                                        min={0}
                                                        hideStepper
                                                        className={cn('pr-11', budgetShareIssue && 'border-destructive focus:ring-destructive/50')}
                                                        aria-invalid={!!budgetShareIssue}
                                                    />
                                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                        {budgetShareIssue ? (
                                                            <span className="w-4 flex justify-center" title={budgetShareIssue}>
                                                                <Icons.AlertTriangle className="w-3.5 h-3.5 text-destructive" aria-label={budgetShareIssue} />
                                                            </span>
                                                        ) : (
                                                            <span className="w-4 text-center text-muted-foreground text-xs">€</span>
                                                        )}
                                                        <span className="inline-flex items-center justify-center w-[22px] h-[22px]">
                                                            {data.canSuggestShares && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => data.suggestRowShare(index, 'budget')}
                                                                    disabled={item.budgetAmount === ''}
                                                                    aria-label="Wert vorschlagen"
                                                                    title="Wert vorschlagen: NK-Vorauszahlung ÷ WEG × Mietzeitraum (nur dieses Feld)"
                                                                    className="p-0.5 rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                                >
                                                                    <Icons.Calculator className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 align-top">
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
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-border font-semibold">
                                        <td className="px-3 py-2">Summe umlagefähig</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.totalActualAllocable)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitActualShare)}</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.totalBudgetAllocable)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitBudgetShare)}</td>
                                        <td></td>
                                    </tr>
                                    <tr className="text-muted-foreground">
                                        <td className="px-3 py-2">Summe nicht umlagefähig</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.actualSplit.nonAllocable)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitActualShareNonAllocable)}</td>
                                        <td className="px-3 py-2 text-right border-l border-border whitespace-nowrap">{euro(data.budgetSplit.nonAllocable)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{euro(data.unitBudgetShareNonAllocable)}</td>
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
                                    <tr className={!data.tenancy ? 'text-muted-foreground' : data.settlementCoverage === 'shortfall' ? 'text-destructive' : data.settlementCoverage === 'surplus' ? 'text-success' : 'text-muted-foreground'}>
                                        <td className="px-3 py-2 font-medium">
                                            {!data.tenancy ? 'Kein Mieter'
                                                : data.settlementCoverage === 'shortfall' ? 'Nachzahlung durch Mieter'
                                                    : data.settlementCoverage === 'surplus' ? 'Guthaben durch Mieter'
                                                        : 'Ausgeglichen'}
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            {!data.tenancy ? '–' : data.settlementCoverage === 'balanced' ? euro(0) : `${data.overUnderCoverage < 0 ? '-' : '+'}${euro(Math.abs(data.overUnderCoverage))}`}
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">–</td>
                                        <td></td>
                                    </tr>
                                    <tr className={!data.tenancy ? 'text-muted-foreground' : data.budgetCoverage === 'shortfall' ? 'text-destructive' : data.budgetCoverage === 'surplus' ? 'text-success' : 'text-muted-foreground'}>
                                        <td className="px-3 py-2 font-medium">
                                            {!data.tenancy ? 'Kein Mieter'
                                                : data.budgetCoverage === 'shortfall' ? 'Voraussichtliche Nachzahlung'
                                                    : data.budgetCoverage === 'surplus' ? 'Voraussichtliches Guthaben'
                                                        : 'Voraussichtlich ausgeglichen'}
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">–</td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            {!data.tenancy ? '–' : data.budgetCoverage === 'balanced' ? euro(0) : `${data.budgetOverUnderCoverage < 0 ? '-' : '+'}${euro(Math.abs(data.budgetOverUnderCoverage))}`}
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr className="border-t border-border text-primary">
                                        <td className="px-3 py-2 font-medium">
                                            → Neue NK-Vorauszahlung (bringt die Voraussichtliche Nachzahlung/Guthaben auf Null)
                                        </td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">–</td>
                                        <td className="px-3 py-2 border-l border-border">–</td>
                                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                                            {data.newMonthlyPrepayment != null ? `${euro(data.newMonthlyPrepayment)}/Monat` : '–'}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Service charge prepayment adjustment — only meaningful for a
                        currently rented unit; there is no lease to adjust otherwise. */}
                    <div>
                        <SectionLabel>Anpassung Nebenkostenvorauszahlung</SectionLabel>
                        {data.tenancy ? (
                            <>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <MetricCard
                                        // Frozen to this settlement's period end — never pulled along by
                                        // applying a new rate for next year (that only takes effect the
                                        // day after this period ends), so this always reflects what was
                                        // actually billed for this Abrechnung, not whatever the tenancy's
                                        // rate happens to be today.
                                        label="Bisherige NK-Vorauszahlung"
                                        value={`${euro(data.prepaymentUntilSettlement)}`}
                                        detail="/Monat"
                                    />
                                    <MetricCard
                                        label="Neue NK-Vorauszahlung"
                                        value={data.newMonthlyPrepayment != null ? euro(data.newMonthlyPrepayment) : '–'}
                                        // The old "shortfall/surplus" wording here was computed from the
                                        // underlying annual comparison alone, so it kept claiming e.g. "Reduzierung
                                        // wegen Überdeckung" even once bisherige/neu already showed the identical
                                        // number (nothing left to reduce). Shown only when the two displayed
                                        // values actually differ — compared against prepaymentUntilSettlement
                                        // (what's on screen), not the live tenancy rate the button itself acts on.
                                        detail={data.displayedPrepaymentDelta == null
                                            ? undefined
                                            : data.displayedPrepaymentDelta === 0
                                                ? 'entspricht der aktuellen Vorauszahlung'
                                                : `${data.displayedPrepaymentDelta > 0 ? '+' : '−'}${euro(Math.abs(data.displayedPrepaymentDelta))}${data.displayedPrepaymentDeltaPercent != null ? ` (${data.displayedPrepaymentDeltaPercent > 0 ? '+' : '−'}${Math.abs(data.displayedPrepaymentDeltaPercent).toFixed(1).replace('.', ',')} %)` : ''}`}
                                        tone={data.displayedPrepaymentDelta == null || data.displayedPrepaymentDelta === 0
                                            ? 'neutral'
                                            : data.displayedPrepaymentDelta > 0 ? 'warning' : 'positive'}
                                        action={
                                            <button
                                                type="button"
                                                onClick={() => void data.handleApplyPrepayment()}
                                                disabled={!data.canApplyPrepayment || data.isApplyingPrepayment}
                                                aria-label="Neue NK-Vorauszahlung übernehmen"
                                                title="Neue NK-Vorauszahlung übernehmen"
                                                className="p-1 rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                <Icons.RefreshCw className="w-4 h-4" />
                                            </button>
                                        }
                                    />
                                    <MetricCard
                                        label="Neue monatliche Gesamtmiete"
                                        value={euro(data.newTotalRent)}
                                        detail={`${euro(data.tenancy?.coldRent)} Nettomiete + ${euro(data.newMonthlyPrepayment ?? data.currentMonthlyPrepayment)} NK-Vorauszahlung`}
                                    />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Gültig ab: {formatDeDate(data.nextPrepaymentEffectiveDate.toISOString())}
                                </p>
                            </>
                        ) : (
                            <div className="mt-3 px-4 py-3 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground">
                                {unitLabel} hat aktuell keinen Mieter — eine Anpassung der Nebenkostenvorauszahlung ist erst nach Vermietung möglich.
                            </div>
                        )}
                    </div>

                    {/* Generatable documents */}
                    <div>
                        <SectionLabel>Generierbare Dokumente</SectionLabel>
                        <div className="mt-3 flex flex-col gap-3">
                            <DataCard
                                icon={Icons.FileText}
                                title="Nebenkostenabrechnung"
                                footer={
                                    <>
                                        <DocumentUploadButton
                                            onSelect={data.requestStatementUpload}
                                            disabled={!data.tenancy}
                                            disabledTitle="Bitte zuerst Mieterdaten hinterlegen"
                                        />
                                        <span title={!data.canGeneratePdf ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label="Daten prüfen & Vorschau"
                                                icon={<Icons.Eye className="w-4 h-4" />}
                                                variant="outline"
                                                disabled={!data.canGeneratePdf}
                                                onClick={() => data.goTo(`/existing-properties/${propertyId}/service-charge-settlement/${unit.propertyUnitId}/statement`)}
                                            />
                                        </span>
                                        <span title={!data.canGeneratePdf ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label={data.isGeneratingPdf ? 'Wird erstellt…' : 'PDF generieren'}
                                                icon={data.isGeneratingPdf ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.FileText className="w-4 h-4" />}
                                                variant="primary"
                                                disabled={!data.canGeneratePdf || data.isGeneratingPdf}
                                                onClick={() => void data.handleGeneratePdf()}
                                            />
                                        </span>
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <DocumentBox
                                        docs={data.statementDocs}
                                        label={data.tenantLabel}
                                        onView={data.handleViewDocument}
                                        onDownload={data.handleDownloadDocument}
                                        onDelete={data.requestDeleteDoc}
                                        isBusy={(doc) => data.deletingDocId === doc.tenancyDocumentId}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Vollständige Abrechnung inkl. Wirtschaftsplan und NK-Anpassung
                                    </p>
                                </div>
                            </DataCard>

                            <DataCard
                                icon={Icons.FileSignature}
                                title="Anpassungsschreiben"
                                footer={
                                    <>
                                        <DocumentUploadButton
                                            onSelect={data.requestAdjustmentUpload}
                                            disabled={!data.tenancy}
                                            disabledTitle="Bitte zuerst Mieterdaten hinterlegen"
                                        />
                                        <span title={!data.canGenerateAdjustmentDocx ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label="Daten prüfen & Vorschau"
                                                icon={<Icons.Eye className="w-4 h-4" />}
                                                variant="outline"
                                                disabled={!data.canGenerateAdjustmentDocx}
                                                onClick={() => data.goTo(`/existing-properties/${propertyId}/service-charge-settlement/${unit.propertyUnitId}/adjustment`)}
                                            />
                                        </span>
                                        <span title={!data.canGenerateAdjustmentDocx ? 'Bitte zuerst Mieterdaten und Abrechnungszeitraum hinterlegen' : undefined}>
                                            <Button
                                                label={data.isGeneratingAdjustmentDocx ? 'Wird erstellt…' : 'Word-Dokument generieren'}
                                                icon={data.isGeneratingAdjustmentDocx ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.FileSignature className="w-4 h-4" />}
                                                variant="primary"
                                                disabled={!data.canGenerateAdjustmentDocx || data.isGeneratingAdjustmentDocx}
                                                onClick={() => void data.handleGenerateAdjustmentDocx()}
                                            />
                                        </span>
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <DocumentBox
                                        docs={data.adjustmentDocs}
                                        label={data.tenantLabel}
                                        onView={data.handleViewDocument}
                                        onDownload={data.handleDownloadDocument}
                                        onDelete={data.requestDeleteDoc}
                                        isBusy={(doc) => data.deletingDocId === doc.tenancyDocumentId}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Informiert den Mieter über {data.settlementCoverage === 'shortfall' ? 'die Nachzahlung' : data.settlementCoverage === 'surplus' ? 'die Erstattung' : 'das Ergebnis'} und die neue NK-Vorauszahlung
                                    </p>
                                </div>
                            </DataCard>
                        </div>
                    </div>
                </div>
            </main>

            <DocumentReplaceModal
                open={data.statementReplaceFlow.pending != null}
                fileName={data.statementDocs[0]?.fileName}
                isResolving={data.statementReplaceFlow.isResolving}
                onReplace={() => void data.statementReplaceFlow.confirmReplace()}
                onCancel={data.statementReplaceFlow.cancel}
            />
            <DocumentReplaceModal
                open={data.adjustmentReplaceFlow.pending != null}
                fileName={data.adjustmentDocs[0]?.fileName}
                isResolving={data.adjustmentReplaceFlow.isResolving}
                onReplace={() => void data.adjustmentReplaceFlow.confirmReplace()}
                onCancel={data.adjustmentReplaceFlow.cancel}
            />
            <ConfirmDeleteModal
                open={data.pendingDeleteDoc != null}
                onCancel={data.cancelDeleteDoc}
                onConfirm={() => void data.confirmDeleteDoc()}
                title="Dokument löschen?"
                confirmDisabled={data.deletingDocId != null}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du <span className="font-medium text-foreground">{data.pendingDeleteDoc?.fileName}</span> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
            </ConfirmDeleteModal>
            <ConfirmDeleteModal
                open={data.pendingDeleteSettlement}
                onCancel={data.cancelDeleteSettlement}
                onConfirm={() => void data.confirmDeleteSettlement()}
                title="Abrechnung löschen?"
                confirmDisabled={data.isDeletingSettlement}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du die {data.settlement && settlementPeriodLabel(data.settlement)} wirklich löschen? Alle Kostenpositionen dieser Abrechnung werden mitgelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
            </ConfirmDeleteModal>

            <StickyActionBar
                show={true}
                onGhost={() => data.goTo(data.backHref)}
                onPrimary={() => void data.handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel="Abrechnung speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!data.isEditing || data.isSaving}
                leftContent={<DetailFieldLegend />}
            />

            <UnsavedChangesModal
                open={data.pendingPeriod !== null}
                onCancel={data.cancelPeriodSwitch}
                onDiscard={data.confirmPeriodSwitch}
                context="an der Nebenkostenabrechnung"
            />
            <UnsavedChangesModal
                open={data.pendingHref !== null}
                onCancel={data.cancelDiscard}
                onDiscard={data.confirmDiscard}
                context="an der Nebenkostenabrechnung"
            />
        </div>
    );
}
