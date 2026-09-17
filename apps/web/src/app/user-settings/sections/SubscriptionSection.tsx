"use client";

import { ComingSoonButton, Icons, Tile } from '@/components/ui';
import type { Subscription } from '@immoandthebrain/types';

const PLAN_LABELS: Record<Subscription['subscriptionModel'], string> = {
    FREE: 'ImmoAndTheBrain Free',
    BASIC: 'ImmoAndTheBrain Basic',
    PRO: 'ImmoAndTheBrain Pro',
    ENTERPRISE: 'ImmoAndTheBrain Enterprise',
};

// No per-tier object limit is tracked anywhere in the schema/business
// logic today — showing an invented cap here would misrepresent what's
// actually enforced, so the usage bar shows the real count only, uncapped.
const PLAN_FEATURES: Record<Subscription['subscriptionModel'], string[]> = {
    FREE: ['Bis zu 1 Objekt', 'Basisfunktionen'],
    BASIC: ['Mehrere Objekte', 'Unbegrenzte Dokumente'],
    PRO: ['Unbegrenzte Objekte', 'Unbegrenzte Dokumente', 'KI-Kalkulator & Vorschläge', 'Nebenkostenabrechnung', 'Steuerübersicht & Export', 'Handwerkerportal'],
    ENTERPRISE: ['Unbegrenzte Objekte', 'Mehrbenutzerzugang', 'Persönlicher Support'],
};

export function SubscriptionSection({ subscription, activePropertyCount }: {
    subscription: Subscription | null;
    activePropertyCount: number;
}) {
    const model = subscription?.subscriptionModel ?? 'FREE';

    return (
        <div className="space-y-6">
            <Tile title="Plan & Abonnement" description="Ihr aktueller Plan und enthaltene Funktionen.">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                            <Icons.Crown className="w-3.5 h-3.5" />
                            {model}
                        </span>
                        <span className="text-sm font-medium text-foreground">{PLAN_LABELS[model]}</span>
                    </div>
                    {subscription && (
                        <span className="text-xs text-muted-foreground">Seit {new Date(subscription.startDate).toLocaleDateString('de-DE')}</span>
                    )}
                </div>

                <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Bestandsobjekte</span>
                        <span className="font-medium text-foreground">{activePropertyCount}</span>
                    </div>
                </div>

                <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    {PLAN_FEATURES[model].map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                            <Icons.Check className="w-4 h-4 text-success shrink-0" />
                            {feature}
                        </li>
                    ))}
                </ul>

                <div className="mt-6 flex flex-wrap gap-3">
                    <ComingSoonButton label="Rechnungen anzeigen" icon={<Icons.FileText className="w-4 h-4" />} variant="outline" size="sm" />
                    <ComingSoonButton label="Zahlungsmethode ändern" icon={<Icons.CreditCard className="w-4 h-4" />} variant="outline" size="sm" />
                    <ComingSoonButton label="Abo kündigen" icon={<Icons.X className="w-4 h-4" />} variant="outline" size="sm" />
                </div>
            </Tile>

            <Tile title="ImmoAndTheBrain Enterprise" description="Für Portfolios ab 10 Objekten — unbegrenzte Objekte, Mehrbenutzerzugang und persönlicher Support.">
                <ComingSoonButton label="Kontakt aufnehmen" icon={<Icons.Mail className="w-4 h-4" />} variant="primary" size="sm" />
            </Tile>
        </div>
    );
}
