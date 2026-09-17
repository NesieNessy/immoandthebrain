"use client";

import { Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { cn } from '@/lib/utils';
import type { IconName } from '@/components/common';
import { useRouter, useSearchParams } from 'next/navigation';
import { DangerZoneSection } from './sections/DangerZoneSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { ProfileSection } from './sections/ProfileSection';
import { SecuritySection } from './sections/SecuritySection';
import { SignatureSection } from './sections/SignatureSection';
import { SubscriptionSection } from './sections/SubscriptionSection';
import { useUserSettingsData } from './useUserSettingsData';

type SectionId = 'profil' | 'sicherheit' | 'unterschrift' | 'abonnement' | 'benachrichtigungen' | 'konto-daten';

interface NavItem { id: SectionId; label: string; icon: IconName; }
interface NavGroup { label: string; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
    { label: 'Konto', items: [
        { id: 'profil', label: 'Profil', icon: 'User' },
        { id: 'sicherheit', label: 'Sicherheit', icon: 'Shield' },
        { id: 'unterschrift', label: 'Unterschrift', icon: 'FileSignature' },
    ] },
    { label: 'Abonnement', items: [
        { id: 'abonnement', label: 'Plan & Abonnement', icon: 'Crown' },
    ] },
    { label: 'Präferenzen', items: [
        { id: 'benachrichtigungen', label: 'Benachrichtigungen', icon: 'Bell' },
    ] },
];

const DANGER_ITEM: NavItem = { id: 'konto-daten', label: 'Konto löschen', icon: 'Trash2' };

const ALL_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), DANGER_ITEM];

function isSectionId(value: string | null): value is SectionId {
    return ALL_ITEMS.some((item) => item.id === value);
}

export function UserSettingsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isOnboarding = searchParams.get('onboarding') === '1';
    const rawSection = searchParams.get('section');
    const activeSection: SectionId = isSectionId(rawSection) ? rawSection : 'profil';

    const { user, isLoading: authLoading } = useRequireAuth();
    const { personalData, subscription, activePropertyCount, isLoading: dataLoading, applyPersonalDataUpdate } = useUserSettingsData(user);

    const goToSection = (id: SectionId) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('section', id);
        router.replace(`/user-settings?${params.toString()}`, { scroll: false });
    };

    if (authLoading || dataLoading || !personalData || !user) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={[{ label: 'Einstellungen' }]} />

                {isOnboarding && (
                    <div className="p-4 bg-info/10 border border-info/30 rounded-lg text-info text-sm">
                        Bitte vervollständigen Sie zunächst Ihre Benutzereinstellungen, bevor Sie ImmoAndTheBrain nutzen können.
                    </div>
                )}

                <div className="mt-6 flex flex-col lg:flex-row gap-6">
                    {/* Mobile / narrow: horizontal scrollable tab row */}
                    <nav className="lg:hidden -mx-1 px-1 overflow-x-auto">
                        <div className="flex items-center gap-2 pb-1">
                            {ALL_ITEMS.map((item) => {
                                const Icon = Icons[item.icon];
                                const isActive = item.id === activeSection;
                                const isDanger = item.id === 'konto-daten';
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => goToSection(item.id)}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap shrink-0 cursor-pointer transition-colors',
                                            isActive ? 'bg-primary text-primary-foreground' : isDanger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted',
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    {/* Desktop: vertical sidebar */}
                    <aside className="hidden lg:block w-56 shrink-0 space-y-6">
                        {NAV_GROUPS.map((group) => (
                            <div key={group.label}>
                                <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</p>
                                <div className="space-y-0.5">
                                    {group.items.map((item) => {
                                        const Icon = Icons[item.icon];
                                        const isActive = item.id === activeSection;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => goToSection(item.id)}
                                                className={cn(
                                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer transition-colors',
                                                    isActive ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted',
                                                )}
                                            >
                                                <Icon className="w-4 h-4 shrink-0" />
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        <div className="pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => goToSection(DANGER_ITEM.id)}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-pointer transition-colors',
                                    activeSection === DANGER_ITEM.id ? 'bg-destructive/10 text-destructive font-medium' : 'text-destructive/80 hover:bg-destructive/10',
                                )}
                            >
                                <Icons.Trash2 className="w-4 h-4 shrink-0" />
                                {DANGER_ITEM.label}
                            </button>
                        </div>
                    </aside>

                    <div className="flex-1 min-w-0">
                        {activeSection === 'profil' && (
                            <ProfileSection userId={user.id} personalData={personalData} onSaved={applyPersonalDataUpdate} />
                        )}
                        {activeSection === 'sicherheit' && <SecuritySection />}
                        {activeSection === 'unterschrift' && (
                            <SignatureSection userId={user.id} personalData={personalData} onSaved={applyPersonalDataUpdate} />
                        )}
                        {activeSection === 'abonnement' && (
                            <SubscriptionSection subscription={subscription} activePropertyCount={activePropertyCount} />
                        )}
                        {activeSection === 'benachrichtigungen' && (
                            <NotificationsSection userId={user.id} personalData={personalData} onSaved={applyPersonalDataUpdate} />
                        )}
                        {activeSection === 'konto-daten' && (
                            <DangerZoneSection userId={user.id} personalData={personalData} />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
