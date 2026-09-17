"use client";

import { Button, Icons, LoadingScreen, useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getPersonalData, updatePersonalData } from '@/lib/supabase/personal_data.supabase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AccountReactivatePage() {
    const router = useRouter();
    const { showToast } = useToast();
    const { user, isLoading: authLoading } = useRequireAuth();
    const [isDeactivated, setIsDeactivated] = useState<boolean | null>(null);
    const [isReactivating, setIsReactivating] = useState(false);

    useEffect(() => {
        if (!user) return;
        (async () => {
            const personalData = await getPersonalData(user.id);
            // Landed here directly without actually being deactivated (or
            // no profile yet) — nothing to do, back to the app.
            if (!personalData?.deactivatedAt) {
                router.replace('/');
                return;
            }
            setIsDeactivated(true);
        })();
    }, [user, router]);

    const handleReactivate = async () => {
        if (!user) return;
        setIsReactivating(true);
        const updated = await updatePersonalData(user.id, { deactivatedAt: null });
        setIsReactivating(false);
        if (!updated) {
            showToast('Konto konnte nicht reaktiviert werden.', 'error');
            return;
        }
        showToast('Konto reaktiviert.', 'success');
        router.replace('/');
    };

    if (authLoading || isDeactivated === null) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                    <Icons.Archive className="w-6 h-6 text-warning" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Ihr Konto ist pausiert</h1>
                <p className="text-sm text-muted-foreground">
                    Sie haben Ihr Konto in den Einstellungen deaktiviert. Ihre Daten sind weiterhin vorhanden — reaktivieren Sie Ihr Konto, um ImmoAndTheBrain wieder zu nutzen.
                </p>
                <Button
                    label="Konto reaktivieren"
                    icon={<Icons.RefreshCw className="w-4 h-4" />}
                    variant="primary"
                    onClick={() => void handleReactivate()}
                    disabled={isReactivating}
                    className="mx-auto"
                />
            </div>
        </div>
    );
}
