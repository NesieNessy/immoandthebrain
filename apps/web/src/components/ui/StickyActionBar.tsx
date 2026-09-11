"use client";

import { Button } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { cn } from '@/lib/utils';
import React from 'react';

interface StickyActionBarProps {
    show: boolean;
    onGhost: () => void;
    onPrimary: () => void;
    /** Defaults to "Zurück" — the ghost button is a "leave this page" action
     *  on virtually every page that uses this bar. Pass an explicit label
     *  only when a page genuinely needs something else (e.g. "Abbrechen" for
     *  a destructive discard-changes context). */
    ghostLabel?: string;
    primaryLabel: string;
    ghostIcon?: React.ReactNode;
    primaryIcon?: React.ReactNode;
    ghostDisabled?: boolean;
    primaryDisabled?: boolean;
    /** e.g. a "Schritt 1 von 2" label, shown at the start of the bar. */
    leftContent?: React.ReactNode;
    /** Optional third button, rendered between ghost and primary — for a
     *  secondary action (e.g. "Detailbewertung starten") that doesn't fit
     *  either the "leave" (ghost) or "confirm" (primary) role. */
    onSecondary?: () => void;
    secondaryLabel?: string;
    secondaryIcon?: React.ReactNode;
    secondaryDisabled?: boolean;
}

export function StickyActionBar({
    show,
    onGhost,
    onPrimary,
    ghostLabel = BUTTON_DETAILS.Back.label,
    primaryLabel,
    ghostIcon = <BUTTON_DETAILS.Back.icon className="w-4 h-4" />,
    primaryIcon,
    ghostDisabled = false,
    primaryDisabled = false,
    leftContent,
    onSecondary,
    secondaryLabel,
    secondaryIcon,
    secondaryDisabled = false,
}: StickyActionBarProps) {
    if (!show) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-50">
            <div className={cn("container mx-auto px-4 py-4 flex items-center gap-3", leftContent ? "justify-between" : "justify-end")}>
                {leftContent}
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        onClick={onGhost}
                        label={ghostLabel}
                        icon={ghostIcon}
                        disabled={ghostDisabled}
                    />
                    {onSecondary && secondaryLabel && (
                        <Button
                            variant="outline"
                            onClick={onSecondary}
                            label={secondaryLabel}
                            icon={secondaryIcon}
                            disabled={secondaryDisabled}
                        />
                    )}
                    <Button
                        variant="primary"
                        onClick={onPrimary}
                        label={primaryLabel}
                        icon={primaryIcon}
                        disabled={primaryDisabled}
                    />
                </div>
            </div>
        </div>
    );
}
