"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, Icons, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, UnsavedChangesModal, useToast, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { cn, deCurrencyFormatter, deNumberFormatter } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
    computeCashFlow,
    computeDevelopment,
    computeGrossYield,
    computeMonthlyDebtService,
    computeNetYield,
    computePricePerSqm,
    computeReturnOnEquity,
    computeTaxFreeSaleDate,
    formatTaxFreeSaleDate,
    formatYearsMonthsUntil,
    projectRent,
} from './keyMetricsCalculations';
import { useKeyMetricsData } from './useKeyMetricsData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(Math.round(value))} €`;
}

function percentLabel(value: number): string {
    return `${value >= 0 ? '+' : ''}${deNumberFormatter.format(value)}%`;
}

type Tone = 'positive' | 'negative' | 'neutral';

function trendFromPercent(percent: number): 'up' | 'down' | 'flat' {
    if (percent > 0) return 'up';
    if (percent < 0) return 'down';
    return 'flat';
}

// A directional indicator, not a plotted history — the app doesn't keep a
// month-by-month series for rent/value, only a before/after snapshot, so the
// bars simply illustrate "trending up/down/flat" rather than real data points.
function TrendBars({ direction }: { direction: 'up' | 'down' | 'flat' }) {
    const heights = direction === 'down'
        ? [90, 78, 66, 54, 44, 34]
        : direction === 'flat'
            ? [50, 50, 50, 50, 50, 50]
            : [34, 44, 54, 66, 78, 90];
    return (
        <div className="flex items-end gap-1 h-7" aria-hidden="true">
            {heights.map((h, i) => (
                <div
                    key={i}
                    className={cn("w-2 rounded-sm", i === heights.length - 1 ? "bg-primary" : "bg-primary/20")}
                    style={{ height: `${h}%` }}
                />
            ))}
        </div>
    );
}

function StatCard({
    icon: Icon, colorClass, label, value, subtitle, badge, trend,
}: {
    icon: React.ElementType;
    colorClass: string;
    label: string;
    value: string;
    subtitle?: React.ReactNode;
    badge?: { text: string; tone: Tone } | null;
    trend?: 'up' | 'down' | 'flat';
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("w-7 h-7 shrink-0 rounded-md flex items-center justify-center", colorClass)}>
                        <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</span>
                </div>
                {badge && (
                    <span className={cn(
                        "inline-flex items-center gap-0.5 shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                        badge.tone === 'positive' && "bg-success/15 text-success",
                        badge.tone === 'negative' && "bg-destructive/15 text-destructive",
                        badge.tone === 'neutral' && "bg-muted text-muted-foreground",
                    )}>
                        {badge.tone === 'positive' && <Icons.TrendingUp className="w-3 h-3" />}
                        {badge.tone === 'negative' && <Icons.TrendingDown className="w-3 h-3" />}
                        {badge.text}
                    </span>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-2xl font-semibold text-foreground break-words">{value}</p>
                {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
            </div>
            {trend && <TrendBars direction={trend} />}
        </div>
    );
}

interface FinancialsForm {
    currentMarketValue: string;
    loanAmount: string;
    equity: string;
    interestRate: string;
    repaymentRate: string;
    fixedInterestPeriodYears: string;
}

const EMPTY_FINANCIALS_FORM: FinancialsForm = {
    currentMarketValue: '',
    loanAmount: '',
    equity: '',
    interestRate: '',
    repaymentRate: '',
    fixedInterestPeriodYears: '',
};

export default function KeyMetrics({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const { showToast } = useToast();
    const data = useKeyMetricsData(propertyId);

    const [form, setForm] = useState<FinancialsForm>(EMPTY_FINANCIALS_FORM);
    const [original, setOriginal] = useState<FinancialsForm>(EMPTY_FINANCIALS_FORM);
    const [seeded, setSeeded] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    useEffect(() => {
        if (seeded || data.isLoading) return;
        const f = data.financials;
        const initial: FinancialsForm = {
            currentMarketValue: f.currentMarketValue != null ? String(f.currentMarketValue) : '',
            loanAmount: f.loanAmount != null ? String(f.loanAmount) : '',
            equity: f.equity != null ? String(f.equity) : '',
            interestRate: f.interestRate != null ? String(f.interestRate) : '',
            repaymentRate: f.repaymentRate != null ? String(f.repaymentRate) : '',
            fixedInterestPeriodYears: f.fixedInterestPeriodYears != null ? String(f.fixedInterestPeriodYears) : '',
        };
        setForm(initial);
        setOriginal(initial);
        setSeeded(true);
    }, [seeded, data.isLoading, data.financials]);

    const isEditing = JSON.stringify(form) !== JSON.stringify(original);

    const goTo = (href: string) => {
        if (isEditing) {
            setPendingHref(href);
        } else {
            router.push(href);
        }
    };

    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };

    const handleSave = async () => {
        const saved = await data.saveFinancials({
            currentMarketValue: form.currentMarketValue !== '' ? Number(form.currentMarketValue) : null,
            loanAmount: form.loanAmount !== '' ? Number(form.loanAmount) : null,
            equity: form.equity !== '' ? Number(form.equity) : null,
            interestRate: form.interestRate !== '' ? Number(form.interestRate) : null,
            repaymentRate: form.repaymentRate !== '' ? Number(form.repaymentRate) : null,
            fixedInterestPeriodYears: form.fixedInterestPeriodYears !== '' ? Number(form.fixedInterestPeriodYears) : null,
        });
        if (saved) {
            setOriginal(form);
            showToast('Finanzierungsangaben gespeichert.');
        } else {
            showToast('Finanzierungsangaben konnten nicht gespeichert werden.', 'error');
        }
    };

    const metrics = useMemo(() => {
        const { property, purchaseDate, aggregates } = data;
        const purchasePrice = property?.purchasePrice ?? 0;
        const squareMeters = property?.squareMeters ?? aggregates.livingAreaM2;
        const currentMarketValue = form.currentMarketValue !== '' ? Number(form.currentMarketValue) : null;
        const loanAmount = form.loanAmount !== '' ? Number(form.loanAmount) : 0;
        const equity = form.equity !== '' ? Number(form.equity) : 0;
        const interestRate = form.interestRate !== '' ? Number(form.interestRate) : 0;
        const repaymentRate = form.repaymentRate !== '' ? Number(form.repaymentRate) : 0;
        const fixedInterestPeriodYears = form.fixedInterestPeriodYears !== '' ? Number(form.fixedInterestPeriodYears) : 0;

        const hasRentBaseline = aggregates.targetColdRentTotal > 0;
        const rentDevelopment = computeDevelopment(aggregates.targetColdRentTotal, aggregates.currentColdRentTotal);

        const hasMarketValue = currentMarketValue != null && purchasePrice > 0;
        const valueAppreciation = computeDevelopment(purchasePrice, currentMarketValue ?? purchasePrice);

        const currentColdRentPerSqm = aggregates.livingAreaM2 > 0 ? aggregates.currentColdRentTotal / aggregates.livingAreaM2 : 0;
        const initialColdRentPerSqm = aggregates.livingAreaM2 > 0 ? aggregates.targetColdRentTotal / aggregates.livingAreaM2 : 0;
        const coldRentPerSqmChange = currentColdRentPerSqm - initialColdRentPerSqm;

        const pricePerSqm = computePricePerSqm(purchasePrice, squareMeters);
        const grossYield = computeGrossYield(aggregates.currentColdRentTotal * 12, purchasePrice);
        const netYield = computeNetYield(aggregates.currentColdRentTotal * 12, aggregates.nonAllocableMonthlyCostsTotal * 12, purchasePrice);

        const monthlyDebtService = computeMonthlyDebtService(loanAmount, interestRate, repaymentRate);
        const cashFlowCurrent = computeCashFlow(aggregates.currentColdRentTotal, monthlyDebtService, aggregates.nonAllocableMonthlyCostsTotal);
        const cashFlowInitial = computeCashFlow(
            hasRentBaseline ? aggregates.targetColdRentTotal : aggregates.currentColdRentTotal,
            monthlyDebtService,
            aggregates.nonAllocableMonthlyCostsTotal,
        );
        const projectedRent = fixedInterestPeriodYears > 0
            ? projectRent(aggregates.currentColdRentTotal, rentDevelopment.percentChange, fixedInterestPeriodYears)
            : aggregates.currentColdRentTotal;
        const cashFlowForecast = computeCashFlow(projectedRent, monthlyDebtService, aggregates.nonAllocableMonthlyCostsTotal);

        const returnOnEquity = computeReturnOnEquity(cashFlowCurrent * 12, equity);

        const taxFreeSaleDate = purchaseDate ? computeTaxFreeSaleDate(purchaseDate) : null;
        const timeToTaxFreeSale = taxFreeSaleDate ? formatYearsMonthsUntil(taxFreeSaleDate) : null;

        return {
            purchasePrice, squareMeters,
            hasRentBaseline, rentDevelopment,
            hasMarketValue, valueAppreciation,
            currentColdRentPerSqm, coldRentPerSqmChange,
            pricePerSqm, grossYield, netYield,
            monthlyDebtService, cashFlowCurrent, cashFlowInitial, cashFlowForecast, fixedInterestPeriodYears,
            equity, returnOnEquity,
            taxFreeSaleDate, timeToTaxFreeSale,
        };
    }, [data, form]);

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const { property, aggregates } = data;
    const rnd = aggregates.rnd;

    const breadcrumbItems: BreadcrumbItem[] = [
        {
            label: 'Bestandsobjekte',
            href: '/existing-properties',
            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo('/existing-properties'); } },
        },
        {
            label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
            href: `/existing-properties/${propertyId}`,
            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo(`/existing-properties/${propertyId}`); } },
        },
        { label: ExistingPropertiesUseCases.KeyMetrics },
    ];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={breadcrumbItems} />

                <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-3">
                        <SectionLabel>Entwicklung</SectionLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <StatCard
                                icon={Icons.TrendingUp}
                                colorClass="bg-success/15 text-success"
                                label="Mietentwicklung"
                                value={euro(aggregates.currentColdRentTotal)}
                                subtitle="Nettokaltmiete / Monat"
                                badge={metrics.hasRentBaseline ? { text: percentLabel(metrics.rentDevelopment.percentChange), tone: metrics.rentDevelopment.percentChange >= 0 ? 'positive' : 'negative' } : { text: '–', tone: 'neutral' }}
                                trend={trendFromPercent(metrics.rentDevelopment.percentChange)}
                            />
                            <StatCard
                                icon={Icons.Building2}
                                colorClass="bg-accent-violet/15 text-accent-violet"
                                label="Wertsteigerung"
                                value={metrics.hasMarketValue ? euro(form.currentMarketValue !== '' ? Number(form.currentMarketValue) : metrics.purchasePrice) : euro(metrics.purchasePrice)}
                                subtitle={metrics.hasMarketValue ? 'Aktueller Schätzwert' : 'Verkehrswert noch nicht hinterlegt'}
                                badge={metrics.hasMarketValue ? { text: percentLabel(metrics.valueAppreciation.percentChange), tone: metrics.valueAppreciation.percentChange >= 0 ? 'positive' : 'negative' } : { text: '–', tone: 'neutral' }}
                                trend={trendFromPercent(metrics.valueAppreciation.percentChange)}
                            />
                            <StatCard
                                icon={Icons.Ruler}
                                colorClass="bg-accent-sky/15 text-accent-sky"
                                label="Kaltmiete pro m²"
                                value={aggregates.livingAreaM2 > 0 ? `${deNumberFormatter.format(metrics.currentColdRentPerSqm)} €` : '–'}
                                subtitle={aggregates.livingAreaM2 > 0 ? `pro m² / Monat (${deNumberFormatter.format(aggregates.livingAreaM2)} m²)` : 'Keine Einheiten hinterlegt'}
                                badge={metrics.hasRentBaseline && aggregates.livingAreaM2 > 0
                                    ? { text: `${metrics.coldRentPerSqmChange >= 0 ? '+' : ''}${deNumberFormatter.format(metrics.coldRentPerSqmChange)} €`, tone: metrics.coldRentPerSqmChange >= 0 ? 'positive' : 'negative' }
                                    : { text: '–', tone: 'neutral' }}
                                trend={trendFromPercent(metrics.coldRentPerSqmChange)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <SectionLabel>Rendite</SectionLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <StatCard
                                icon={Icons.DollarSign}
                                colorClass="bg-primary/10 text-primary"
                                label="Preis pro m²"
                                value={metrics.squareMeters > 0 && metrics.purchasePrice > 0 ? `${deNumberFormatter.format(metrics.pricePerSqm)} €` : '–'}
                                subtitle="Kaufpreis / Wohnfläche"
                            />
                            <StatCard
                                icon={Icons.PieChart}
                                colorClass="bg-accent-terracotta/15 text-accent-terracotta"
                                label="Bruttorendite"
                                value={metrics.purchasePrice > 0 ? `${deNumberFormatter.format(metrics.grossYield)} %` : '–'}
                                subtitle="Jahreskaltmiete / Kaufpreis"
                            />
                            <StatCard
                                icon={Icons.PieChart}
                                colorClass="bg-accent-sage/15 text-accent-sage"
                                label="Nettorendite"
                                value={metrics.purchasePrice > 0 ? `${deNumberFormatter.format(metrics.netYield)} %` : '–'}
                                subtitle="Nach nicht umlagefähigen Kosten"
                            />
                            <StatCard
                                icon={Icons.PiggyBank}
                                colorClass="bg-warning/15 text-warning"
                                label="Eigenkapitalrendite"
                                value={metrics.equity > 0 ? `${deNumberFormatter.format(metrics.returnOnEquity)} %` : '–'}
                                subtitle="Bezogen auf eingesetztes EK"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <SectionLabel>Substanz &amp; Nutzung</SectionLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <StatCard
                                icon={Icons.Building}
                                colorClass="bg-info/15 text-info"
                                label="Anteil Gebäude"
                                value={`${deNumberFormatter.format(aggregates.buildingSharePercent)} %`}
                                subtitle={`${deNumberFormatter.format(100 - aggregates.buildingSharePercent)} % Grundstücksanteil`}
                            />
                            <StatCard
                                icon={Icons.Clock}
                                colorClass="bg-accent-coral/15 text-accent-coral"
                                label="Aktuelle Restnutzungsdauer"
                                value={`${deNumberFormatter.format(rnd?.remainingUsefulLifeYears ?? 50)} Jahre`}
                                subtitle={`Baujahr ${property.yearOfConstruction} · Nutzungsdauer ${deNumberFormatter.format(aggregates.totalUsefulLifeYears)} J.`}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <SectionLabel>Finanzielle Kennzahlen</SectionLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                icon={Icons.ArrowRightLeft}
                                colorClass="bg-destructive/15 text-destructive"
                                label="Monatliche Kapitalbelastung"
                                value={metrics.monthlyDebtService > 0 ? euro(metrics.monthlyDebtService) : '–'}
                                subtitle="Zins + Tilgung / Monat"
                            />
                            <StatCard
                                icon={Icons.TrendingUp}
                                colorClass="bg-success/15 text-success"
                                label="Cashflow"
                                value={euro(metrics.cashFlowCurrent)}
                                subtitle={
                                    <div className="flex flex-col gap-0.5">
                                        <span>Miete abzgl. Kosten / Monat</span>
                                        {metrics.fixedInterestPeriodYears > 0 && (
                                            <span>Prognose Ende Zinsbindung: {euro(metrics.cashFlowForecast)}</span>
                                        )}
                                    </div>
                                }
                            />
                            <StatCard
                                icon={Icons.PiggyBank}
                                colorClass="bg-warning/15 text-warning"
                                label="Eigenkapitalrendite"
                                value={metrics.equity > 0 ? `${deNumberFormatter.format(metrics.returnOnEquity)} %` : '–'}
                                subtitle="Bezogen auf eingesetztes EK"
                            />
                            <StatCard
                                icon={Icons.Calendar}
                                colorClass="bg-accent-violet/15 text-accent-violet"
                                label="Zeit bis steuerfreier Verkauf"
                                value={metrics.timeToTaxFreeSale ?? (metrics.taxFreeSaleDate ? 'Verkauf steuerfrei' : '–')}
                                subtitle={metrics.taxFreeSaleDate
                                    ? `Verkauf steuerfrei ab ${formatTaxFreeSaleDate(metrics.taxFreeSaleDate)}`
                                    : 'Kaufdatum nicht hinterlegt'}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <SectionLabel>Finanzierungsangaben</SectionLabel>
                        <p className="text-sm text-muted-foreground">
                            Diese Werte fließen in die Kennzahlen oben ein und sind für dieses Objekt sonst nirgends hinterlegt.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                            <NumberField
                                label="Aktueller Verkehrswert"
                                optional
                                unit="€"
                                placeholder="485.000"
                                value={form.currentMarketValue}
                                onChange={(e) => setForm((prev) => ({ ...prev, currentMarketValue: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                            <NumberField
                                label="Restschuld Darlehen"
                                optional
                                unit="€"
                                placeholder="180.000"
                                value={form.loanAmount}
                                onChange={(e) => setForm((prev) => ({ ...prev, loanAmount: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                            <NumberField
                                label="Eingesetztes Eigenkapital"
                                optional
                                unit="€"
                                placeholder="67.500"
                                value={form.equity}
                                onChange={(e) => setForm((prev) => ({ ...prev, equity: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                            <NumberField
                                label="Zinssatz"
                                optional
                                unit="%"
                                step="0.01"
                                placeholder="3,50"
                                value={form.interestRate}
                                onChange={(e) => setForm((prev) => ({ ...prev, interestRate: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                            <NumberField
                                label="Tilgungssatz"
                                optional
                                unit="%"
                                step="0.01"
                                placeholder="2,00"
                                value={form.repaymentRate}
                                onChange={(e) => setForm((prev) => ({ ...prev, repaymentRate: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                            <NumberField
                                label="Zinsbindung"
                                optional
                                unit="Jahre"
                                placeholder="10"
                                value={form.fixedInterestPeriodYears}
                                onChange={(e) => setForm((prev) => ({ ...prev, fixedInterestPeriodYears: e.target.value }))}
                                min={0}
                                hideStepper
                            />
                        </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/30 text-xs text-info">
                        <Icons.Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Die Kennzahlen basieren auf den hinterlegten Objekt-, Miet- und Finanzierungsdaten. Änderungen dort werden hier
                            automatisch aktualisiert.
                        </span>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => goTo(`/existing-properties/${propertyId}`)}
                onPrimary={() => void handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                primaryLabel="Finanzierungsangaben speichern"
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!isEditing || data.isSaving}
            />

            <UnsavedChangesModal
                open={pendingHref !== null}
                onCancel={() => setPendingHref(null)}
                onDiscard={confirmDiscard}
                context="an den Finanzierungsangaben"
            />
        </div>
    );
}
