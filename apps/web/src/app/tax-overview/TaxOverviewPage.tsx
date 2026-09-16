"use client";

import {
    Button,
    Dropdown,
    FilePickerButton,
    Header,
    Icons,
    LoadingScreen,
    Modal,
    NumberField,
    PAGE_CONTAINER_CLASS,
    Tag,
} from '@/components/ui';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { cn, deCurrencyFormatter, downloadBlob } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { buildTaxOverviewReportHtml } from './taxOverviewExport';
import { useTaxOverviewData, type TaxOverviewPropertyRow, type TaxOverviewStatus } from './useTaxOverviewData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
}

const STATUS_META: Record<TaxOverviewStatus, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    complete: { label: 'Vollständig', variant: 'success' },
    partial: { label: 'Belege fehlen', variant: 'warning' },
    incomplete: { label: 'Unvollständig', variant: 'danger' },
};

function StatTile({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={cn('mt-2 text-2xl font-semibold text-foreground', valueClassName)}>{value}</p>
        </div>
    );
}

function PropertyCard({
    property,
    year,
    expanded,
    onToggle,
    onUpload,
    onView,
}: {
    property: TaxOverviewPropertyRow;
    year: number;
    expanded: boolean;
    onToggle: () => void;
    onUpload: (categoryId: number) => void;
    onView: (storagePath: string) => void;
}) {
    const status = STATUS_META[property.status];
    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-primary/5 transition-colors cursor-pointer text-left"
            >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Icons.Building2 className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{property.label}</span>
                    <span className="block text-xs text-muted-foreground">
                        {property.unitsCount} Einheit{property.unitsCount === 1 ? '' : 'en'} · Kosten {year}: {euro(property.totalAmount)}
                    </span>
                </span>
                <Tag
                    label={property.status === 'complete' ? `✓ ${status.label}` : property.status === 'partial' ? `${property.missingCount} Beleg${property.missingCount === 1 ? '' : 'e'} fehlend` : status.label}
                    variant={status.variant}
                    size="md"
                    className="shrink-0"
                />
                <Icons.ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', expanded && 'rotate-180')} />
            </button>

            {expanded && (
                <div className="border-t border-border">
                    {property.categories.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-muted-foreground">Noch keine Kostenkategorien angelegt.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-muted/30 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                                        <th className="px-4 py-2 text-left whitespace-nowrap">Kategorie</th>
                                        <th className="px-4 py-2 text-left whitespace-nowrap">Betrag</th>
                                        <th className="px-4 py-2 text-left whitespace-nowrap">Beleg(e)</th>
                                        <th className="px-4 py-2 text-left whitespace-nowrap">Aktion</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {property.categories.map((category) => (
                                        <tr key={category.categoryId}>
                                            <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{category.label}</td>
                                            <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                                                {category.documents.length > 0 ? euro(category.amount) : '–'}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {category.documents.length > 0 ? (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {category.documents.map((document) => (
                                                            <button
                                                                key={document.taxExpenseDocumentId}
                                                                type="button"
                                                                onClick={() => onView(document.storagePath)}
                                                                className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border border-border bg-muted/40 text-xs max-w-[180px] hover:border-primary/50 cursor-pointer"
                                                                title={document.fileName}
                                                            >
                                                                <Icons.FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                                                <span className="truncate text-foreground">{document.fileName}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <Button
                                                        label="Hochladen"
                                                        icon={<Icons.Upload className="w-3.5 h-3.5" />}
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => onUpload(category.categoryId)}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {category.documents.length > 0 ? (
                                                    <Button
                                                        label="Vorschau"
                                                        icon={<Icons.Eye className="w-3.5 h-3.5" />}
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onView(category.documents[0].storagePath)}
                                                    />
                                                ) : (
                                                    <Tag label="Beleg fehlt" variant="warning" size="sm" />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-border font-semibold">
                                        <td className="px-4 py-2.5 whitespace-nowrap">Gesamtkosten Objekt {year}</td>
                                        <td className="px-4 py-2.5 text-foreground whitespace-nowrap">{euro(property.totalAmount)}</td>
                                        <td className="px-4 py-2.5" colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TaxOverviewPage() {
    const data = useTaxOverviewData();
    // Collapsed by default — only the properties the user actually opens end
    // up in this set, rather than tracking every collapsed one.
    const [expandedProperties, setExpandedProperties] = useState<Set<number>>(new Set());
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    const toggleProperty = (propertyId: number) => {
        setExpandedProperties((prev) => {
            const next = new Set(prev);
            if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId);
            return next;
        });
    };

    if (data.isLoading || data.year == null) return <LoadingScreen />;

    const handleGenerateReport = async () => {
        setIsGeneratingReport(true);
        try {
            const html = buildTaxOverviewReportHtml(data.year!, data.properties);
            const blob = await htmlToPdfBlob(html);
            downloadBlob(blob, `Steuerbericht_${data.year}.pdf`);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={[{ label: 'Steuerübersicht' }]} />
                <p className="-mt-2 mb-4 text-sm text-muted-foreground">Alle Kosten und Unterlagen nach Steuerjahr und Objekt</p>

                <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
                    <div className="w-40">
                        <Dropdown
                            label="Steuerjahr"
                            options={data.availableYears.map((y) => ({ value: String(y), label: String(y) }))}
                            value={String(data.year)}
                            onChange={(e) => data.setYear(Number(e.target.value))}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            label={isGeneratingReport ? 'Wird erstellt…' : 'Steuerbericht generieren'}
                            icon={isGeneratingReport ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.FileText className="w-4 h-4" />}
                            variant="primary"
                            disabled={isGeneratingReport}
                            onClick={() => void handleGenerateReport()}
                        />
                    </div>
                </div>

                <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm mb-6">
                    <p className="flex items-center gap-2 font-medium text-info">
                        <Sparkles className="w-4 h-4" />
                        Geplant: Export &amp; Formularabgleich
                    </p>
                    <p className="mt-1.5 text-muted-foreground">
                        <span className="font-medium text-foreground">Entwicklungsstufe 1:</span> Alle Daten werden visuell dargestellt.
                        {' '}→ Prüfen, ob bereits eine ELSTER-Formularnummer angegeben werden kann.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                        <span className="font-medium text-foreground">Entwicklungsstufe 2:</span> Integration mit WISO.
                    </p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <StatTile label="Objekte" value={String(data.kpis.propertyCount)} />
                    <StatTile label="Gesamtkosten" value={euro(data.kpis.totalAmount)} />
                    <StatTile label="Belege hochgeladen" value={String(data.kpis.uploadedCount)} valueClassName="text-success" />
                    <StatTile label="Belege fehlend" value={String(data.kpis.missingCount)} valueClassName={data.kpis.missingCount > 0 ? 'text-warning' : undefined} />
                </div>

                <div className="rounded-lg border border-border bg-card p-4 mb-6">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Vollständig</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{data.kpis.completeCount} / {data.kpis.propertyCount}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Vollständig</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />Belege fehlen</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-destructive" />Unvollständig</span>
                    </div>
                </div>

                {data.properties.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Noch keine Bestandsobjekte.</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {data.properties.map((property) => (
                            <PropertyCard
                                key={property.propertyId}
                                property={property}
                                year={data.year!}
                                expanded={expandedProperties.has(property.propertyId)}
                                onToggle={() => toggleProperty(property.propertyId)}
                                onUpload={data.requestUpload}
                                onView={(storagePath) => void data.viewDocument(storagePath)}
                            />
                        ))}
                    </div>
                )}

                <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                    <span className="text-sm font-medium text-foreground">Gesamtkosten steuerlich geltend zu machen — Steuerjahr {data.year}</span>
                    <span className="text-lg font-semibold text-primary">{euro(data.kpis.totalAmount)}</span>
                </div>
            </main>

            <Modal
                open={data.uploadCategoryId !== null}
                onClose={data.closeUploadModal}
                title="Beleg hinzufügen"
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Abbrechen" icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={data.closeUploadModal} />
                        <Button
                            label="Hochladen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            disabled={!data.uploadFile || Number(data.uploadAmount) <= 0 || data.isSubmittingUpload}
                            onClick={() => void data.confirmUpload()}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Trage den Betrag ein, den dieser Beleg zur Kategorie beiträgt — die Kategoriesumme wird daraus automatisch berechnet.
                </p>
                <NumberField
                    label="Betrag"
                    unit="€"
                    value={data.uploadAmount}
                    onChange={(e) => data.setUploadAmount(e.target.value)}
                    min={0}
                />
                <FilePickerButton
                    file={data.uploadFile}
                    onSelect={data.setUploadFile}
                    accept=".pdf,.jpg,.jpeg,.png"
                    id="tax-overview-document-upload"
                />
            </Modal>
        </div>
    );
}
