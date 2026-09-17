"use client";

import { Button, ConfirmDeleteModal, Icons, TextField, Tile, useToast } from '@/components/ui';
import { deleteMyAccount } from '@/lib/supabase/account.supabase';
import { supabase } from '@/lib/supabase/client.supabase';
import { updatePersonalData } from '@/lib/supabase/personal_data.supabase';
import { getProperties } from '@/lib/supabase/property.supabase';
import type { PersonalData } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const DESTRUCTIVE_OUTLINE_CLASS = 'border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground';

export function DangerZoneSection({ userId, personalData }: { userId: string; personalData: PersonalData }) {
    const router = useRouter();
    const { showToast } = useToast();

    const [isExporting, setIsExporting] = useState(false);
    const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
    const [isDeactivating, setIsDeactivating] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        const properties = await getProperties(userId);
        setIsExporting(false);
        const payload = { exportedAt: new Date().toISOString(), personalData, properties };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `immoandthebrain-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const closeDeactivate = () => setIsDeactivateOpen(false);
    const handleDeactivate = async () => {
        setIsDeactivating(true);
        const updated = await updatePersonalData(userId, { deactivatedAt: new Date().toISOString() });
        if (!updated) {
            setIsDeactivating(false);
            showToast('Konto konnte nicht deaktiviert werden.', 'error');
            return;
        }
        await supabase.auth.signOut();
        router.replace('/login');
    };

    const closeDelete = () => { setIsDeleteOpen(false); setDeleteConfirmText(''); };
    const handleDelete = async () => {
        setIsDeleting(true);
        const result = await deleteMyAccount();
        if (!result.success) {
            setIsDeleting(false);
            showToast(result.error ?? 'Konto konnte nicht gelöscht werden.', 'error');
            return;
        }
        await supabase.auth.signOut();
        router.replace('/login?accountDeleted=1');
    };

    const deleteConfirmMatches = deleteConfirmText.trim().toLowerCase() === personalData.emailAddress.trim().toLowerCase();

    return (
        <>
            <Tile title="Konto & Daten" description="Aktionen mit dauerhafter Wirkung auf Ihr Konto und Ihre Daten.">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
                    <div className="px-4 py-2 bg-destructive/10 flex items-center gap-2 text-destructive text-sm font-medium">
                        <Icons.AlertTriangle className="w-4 h-4" />
                        Gefahrenzone
                    </div>
                    <div className="divide-y divide-destructive/20">
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div>
                                <p className="text-sm font-medium text-foreground">Alle Daten exportieren</p>
                                <p className="text-xs text-muted-foreground">Exportiert Ihre Objekt- und Kontodaten als JSON-Datei</p>
                            </div>
                            <Button
                                label={isExporting ? 'Wird exportiert…' : 'Exportieren'}
                                icon={isExporting ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Download className="w-4 h-4" />}
                                variant="outline"
                                size="sm"
                                disabled={isExporting}
                                onClick={() => void handleExport()}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div>
                                <p className="text-sm font-medium text-foreground">Konto deaktivieren</p>
                                <p className="text-xs text-muted-foreground">Ihr Konto wird pausiert — Daten bleiben erhalten und können reaktiviert werden</p>
                            </div>
                            <Button label="Deaktivieren" icon={<Icons.Archive className="w-4 h-4" />} variant="outline" size="sm" onClick={() => setIsDeactivateOpen(true)} />
                        </div>
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div>
                                <p className="text-sm font-medium text-foreground">Konto dauerhaft löschen</p>
                                <p className="text-xs text-muted-foreground">Alle Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
                            </div>
                            <Button label="Konto löschen" icon={<Icons.Trash2 className="w-4 h-4" />} variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE_CLASS} onClick={() => setIsDeleteOpen(true)} />
                        </div>
                    </div>
                </div>
            </Tile>

            <ConfirmDeleteModal
                open={isDeactivateOpen}
                onCancel={closeDeactivate}
                onConfirm={() => void handleDeactivate()}
                title="Konto deaktivieren?"
                confirmDisabled={isDeactivating}
            >
                <p className="text-sm text-muted-foreground">
                    Sie werden sofort abgemeldet und können sich erst nach der Reaktivierung wieder anmelden — Ihre Objekte und Dokumente bleiben dabei vollständig erhalten. Melden Sie sich jederzeit erneut an, um Ihr Konto selbst zu reaktivieren.
                </p>
            </ConfirmDeleteModal>

            <ConfirmDeleteModal
                open={isDeleteOpen}
                onCancel={closeDelete}
                onConfirm={() => void handleDelete()}
                title="Konto dauerhaft löschen?"
                confirmDisabled={!deleteConfirmMatches || isDeleting}
            >
                <p className="text-sm text-muted-foreground">
                    Alle Ihre Objekte, Dokumente und persönlichen Daten werden unwiderruflich gelöscht und Ihr Zugang wird entfernt. Diese Aktion kann <span className="font-medium text-destructive">nicht</span> rückgängig gemacht werden.
                </p>
                <div className="mt-3">
                    <TextField
                        label={`Geben Sie zur Bestätigung "${personalData.emailAddress}" ein`}
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        autoComplete="off"
                    />
                </div>
            </ConfirmDeleteModal>
        </>
    );
}
