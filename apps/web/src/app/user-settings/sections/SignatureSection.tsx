"use client";

import { Button, Icons, Tile, useToast } from '@/components/ui';
import { updatePersonalData } from '@/lib/supabase/personal_data.supabase';
import { removeUserAsset, uploadUserAsset, userAssetStoragePathFromUrl } from '@/lib/supabase/user_assets.supabase';
import type { PersonalData } from '@immoandthebrain/types';
import { useRef, useState } from 'react';

export function SignatureSection({ userId, personalData, onSaved }: {
    userId: string;
    personalData: PersonalData;
    onSaved: (updated: PersonalData) => void;
}) {
    const { showToast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const handleSelect = async (file: File) => {
        setIsUploading(true);
        const { url, error } = await uploadUserAsset(userId, file, 'signature');
        if (!url) {
            showToast(error ?? 'Unterschrift konnte nicht hochgeladen werden.', 'error');
            setIsUploading(false);
            return;
        }
        const previousPath = personalData.signatureUrl ? userAssetStoragePathFromUrl(personalData.signatureUrl) : null;
        const updated = await updatePersonalData(userId, { signatureUrl: url });
        setIsUploading(false);
        if (!updated) {
            showToast('Unterschrift konnte nicht gespeichert werden.', 'error');
            return;
        }
        if (previousPath) void removeUserAsset(previousPath);
        onSaved(updated);
        showToast('Unterschrift gespeichert.', 'success');
    };

    const handleRemove = async () => {
        if (!personalData.signatureUrl) return;
        setIsRemoving(true);
        const path = userAssetStoragePathFromUrl(personalData.signatureUrl);
        const updated = await updatePersonalData(userId, { signatureUrl: null });
        setIsRemoving(false);
        if (!updated) {
            showToast('Unterschrift konnte nicht entfernt werden.', 'error');
            return;
        }
        if (path) void removeUserAsset(path);
        onSaved(updated);
        showToast('Unterschrift entfernt.', 'success');
    };

    return (
        <Tile title="Unterschrift" description="Ihre hinterlegte Unterschrift wird automatisch in generierte Dokumente (Mietvertrag, Mieterbescheinigung) eingefügt.">
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleSelect(file);
                    e.target.value = '';
                }}
            />

            {personalData.signatureUrl ? (
                <div className="flex flex-col items-center gap-4 p-6 border border-border rounded-lg bg-muted/20">
                    <img src={personalData.signatureUrl} alt="Ihre Unterschrift" className="max-h-24 max-w-full object-contain" />
                    <div className="flex items-center gap-2">
                        <Button
                            label={isUploading ? 'Wird hochgeladen…' : 'Ersetzen'}
                            icon={isUploading ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Upload className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            disabled={isUploading || isRemoving}
                            onClick={() => inputRef.current?.click()}
                        />
                        <Button
                            label="Entfernen"
                            icon={<Icons.Trash2 className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            disabled={isUploading || isRemoving}
                            onClick={() => void handleRemove()}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-border rounded-lg text-center">
                    <Icons.FileSignature className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">PNG oder JPG hochladen · Empfohlen: weißer Hintergrund, 400×120 px</p>
                    <Button
                        label={isUploading ? 'Wird hochgeladen…' : 'Datei auswählen'}
                        icon={isUploading ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Upload className="w-4 h-4" />}
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        onClick={() => inputRef.current?.click()}
                    />
                </div>
            )}

            {!personalData.signatureUrl && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icons.Info className="w-3.5 h-3.5 shrink-0" />
                    Aktuell keine Unterschrift hinterlegt. Dokumente werden ohne Unterschrift generiert.
                </p>
            )}
        </Tile>
    );
}
