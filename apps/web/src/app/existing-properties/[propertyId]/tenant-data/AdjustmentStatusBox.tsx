"use client";

import { Button, Icons } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { cn, deCurrencyFormatter } from '@/lib/utils';
import type { TenancyAdjustmentHistoryEntry, TenancyAdjustmentType } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { Bell } from 'lucide-react';

function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

function startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function daysBetween(from: Date, to: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((utcTo - utcFrom) / msPerDay);
}

function relativeDayLabel(days: number): string {
    if (days === 0) return 'in 0 Tagen';
    if (days > 0) return `in ${days} Tagen`;
    return `vor ${Math.abs(days)} Tagen`;
}

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
}

interface AdjustmentStatusBoxProps {
    adjustmentType: TenancyAdjustmentType;
    /** "Mietanpassung" | "Sanierungsanpassung" — used in the generated copy. */
    label: string;
    targetDate: Date | undefined;
    reminderDate: Date | undefined;
    amount: string;
    currentValue: number | null;
    historyEntries: TenancyAdjustmentHistoryEntry[];
    isResolving: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

/**
 * Shared status box for both adjustment cards (next rent adjustment and
 * renovation adjustment) — encapsulates all four states so the two cards stay
 * visually and behaviorally identical:
 *  - green: already accepted (a matching history entry exists for this cycle)
 *  - blue: informational, reminder date not reached yet
 *  - yellow: reminder date reached, decision pending
 *  - red: within 3 months of the target date and still undecided
 */
export function AdjustmentStatusBox({
    adjustmentType,
    label,
    targetDate,
    reminderDate,
    amount,
    currentValue,
    historyEntries,
    isResolving,
    onAccept,
    onDecline,
}: AdjustmentStatusBoxProps) {
    const today = startOfDay(new Date());

    const acceptedEntry = reminderDate
        ? historyEntries.find((h) => h.adjustmentType === adjustmentType && h.note?.includes('übernommen') && new Date(h.createdAt) >= reminderDate)
        : undefined;

    if (acceptedEntry) {
        return (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
                <div className="flex items-center gap-2">
                    <Icons.Check className="w-4 h-4 shrink-0" />
                    <span>
                        {label} übernommen{currentValue != null ? ` — Nettomiete angepasst auf ${euro(currentValue)}` : ''}
                    </span>
                </div>
                <span className="shrink-0 text-success">{format(new Date(acceptedEntry.createdAt), 'dd.MM.yyyy')}</span>
            </div>
        );
    }

    if (!reminderDate || !targetDate) return null;

    const redThreshold = addMonths(targetDate, -3);
    const isRed = today >= redThreshold;
    const isActive = today >= reminderDate;
    const dayLabel = relativeDayLabel(daysBetween(today, reminderDate));

    if (!isActive) {
        return (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/30 text-xs text-info">
                <Bell className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                    <strong>{format(reminderDate, 'dd.MM.yyyy')}</strong>{' '}
                    <span className="text-info">{dayLabel}</span> · Du erhältst zu diesem Datum eine Benachrichtigung.
                </span>
            </div>
        );
    }

    const amountValue = amount !== '' ? Number(amount) : null;
    const newValue = amountValue != null && currentValue != null ? currentValue + amountValue : null;

    return (
        <div className={cn(
            "flex flex-col gap-2 p-3 rounded-lg border text-xs",
            isRed ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-warning/10 border-warning/30 text-warning"
        )}>
            <div className="flex items-start gap-2">
                {isRed ? <Icons.AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Icons.Clock className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>
                    <strong>{format(reminderDate, 'dd.MM.yyyy')}</strong>{' '}
                    <span className={isRed ? "text-destructive" : "text-warning"}>{dayLabel}</span>
                    {' · '}
                    {isRed ? 'Erinnerungsdatum überschritten – bitte jetzt entscheiden.' : 'Erinnerung aktiv · Schreiben vorbereiten und Entscheidung treffen.'}
                </span>
            </div>
            <p className="font-medium">
                Soll die {label} durchgeführt werden?
                {amountValue != null && ` +${euro(amountValue)}${newValue != null ? ` → neue Nettomiete: ${euro(newValue)}` : ''}`}
            </p>
            <div className="flex items-center justify-end gap-2">
                <Button label="Ablehnen" icon={<Icons.X className="w-4 h-4" />} variant="outline" size="sm" disabled={isResolving} onClick={onDecline} />
                <Button label={BUTTON_DETAILS.TakeOver.label} icon={<BUTTON_DETAILS.TakeOver.icon className="w-4 h-4" />} variant="primary" size="sm" disabled={isResolving} onClick={onAccept} />
            </div>
        </div>
    );
}
