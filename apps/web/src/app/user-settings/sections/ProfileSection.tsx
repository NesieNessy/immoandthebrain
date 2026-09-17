"use client";

import { Button, Icons, TextField, Tile, useToast } from '@/components/ui';
import { getLabel } from '@/constants/FieldLabels';
import { PersonalDataSaveError, updatePersonalData, upsertPersonalData } from '@/lib/supabase/personal_data.supabase';
import { uploadUserAsset } from '@/lib/supabase/user_assets.supabase';
import type { PersonalData } from '@immoandthebrain/types';
import { useEffect, useRef, useState } from 'react';

interface FormData {
    firstName: string; lastName: string; emailAddress: string; phoneNumber: string;
    street: string; houseNumber: string; postalCode: string; city: string; taxIdentificationNumber: string;
}

const MISSING_FIELD_LABEL_KEYS: Record<string, string> = {
    last_name: 'LastName', first_name: 'FirstName', street: 'Street', house_number: 'HouseNumber',
    city: 'City', postal_code: 'PostalCode', phone_number: 'PhoneNumber', email_address: 'EmailAddress',
    tax_identification_number: 'taxIdentificationNumber',
};

function toFormData(data: PersonalData): FormData {
    return {
        firstName: data.firstName, lastName: data.lastName, emailAddress: data.emailAddress,
        phoneNumber: data.phoneNumber ?? '', street: data.street, houseNumber: data.houseNumber,
        postalCode: data.postalCode, city: data.city, taxIdentificationNumber: data.taxIdentificationNumber,
    };
}

function initials(personalData: PersonalData): string {
    const first = personalData.firstName.trim().charAt(0);
    const last = personalData.lastName.trim().charAt(0);
    return `${first}${last}`.toUpperCase() || '?';
}

export function ProfileSection({ userId, personalData, onSaved }: {
    userId: string;
    personalData: PersonalData;
    onSaved: (updated: PersonalData) => void;
}) {
    const { showToast } = useToast();
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<FormData>(() => toFormData(personalData));
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setFormData(toFormData(personalData));
        setIsEditing(false);
    }, [personalData]);

    const handleInputChange = (field: keyof FormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setIsEditing(true);
    };

    const handleCancel = () => {
        setFormData(toFormData(personalData));
        setIsEditing(false);
        setError(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            // upsert, not a plain update — this is also how a brand-new
            // account's personal_data row gets created in the first place
            // (see /user-settings?onboarding=1 via useRequireAuth).
            const updated = await upsertPersonalData({ userId, ...formData });
            onSaved(updated);
            setIsEditing(false);
            showToast('Profil gespeichert.', 'success');
        } catch (err) {
            if (err instanceof PersonalDataSaveError && err.missing.length > 0) {
                const fieldNames = err.missing
                    .map((column) => MISSING_FIELD_LABEL_KEYS[column])
                    .filter((key): key is string => !!key)
                    .map((key) => getLabel('PersonalData', key, 'de'));
                setError(`Bitte füllen Sie zunächst folgende Pflichtfelder aus: ${fieldNames.join(', ')}.`);
            } else {
                setError('Fehler beim Speichern. Bitte versuchen Sie es erneut.');
            }
        }
        setIsSaving(false);
    };

    const handleAvatarSelected = async (file: File) => {
        setIsUploadingAvatar(true);
        const { url, error: uploadError } = await uploadUserAsset(userId, file, 'avatar');
        if (!url) {
            showToast(uploadError ?? 'Foto konnte nicht hochgeladen werden.', 'error');
            setIsUploadingAvatar(false);
            return;
        }
        const updated = await updatePersonalData(userId, { profilePicture: url });
        setIsUploadingAvatar(false);
        if (!updated) {
            showToast('Foto konnte nicht gespeichert werden.', 'error');
            return;
        }
        onSaved(updated);
        showToast('Profilbild aktualisiert.', 'success');
    };

    return (
        <div className="space-y-6">
            <Tile title="Profil" description="Ihre persönlichen Angaben werden u.a. für generierte Dokumente (Mietvertrag, Mieterbescheinigung) als Vermieter-Daten verwendet.">
                <div className="flex items-center gap-4 pb-4">
                    <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold overflow-hidden shrink-0">
                        {personalData.profilePicture
                            ? <img src={personalData.profilePicture} alt="" className="w-full h-full object-cover" />
                            : initials(personalData)}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">{formData.firstName} {formData.lastName}</p>
                        <p className="text-xs text-muted-foreground">{formData.emailAddress}</p>
                    </div>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleAvatarSelected(file);
                            e.target.value = '';
                        }}
                    />
                    <Button
                        label={isUploadingAvatar ? 'Wird hochgeladen…' : 'Foto hochladen'}
                        icon={isUploadingAvatar ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Camera className="w-4 h-4" />}
                        variant="outline"
                        size="sm"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        className="ml-auto"
                    />
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                        {error}
                    </div>
                )}

                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Persönliche Informationen</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        label={getLabel('PersonalData', 'FirstName', 'de')}
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'LastName', 'de')}
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'EmailAddress', 'de')}
                        value={formData.emailAddress}
                        type="email"
                        onChange={(e) => handleInputChange('emailAddress', e.target.value)}
                    />
                    <TextField
                        label={`${getLabel('PersonalData', 'PhoneNumber', 'de')} (opt.)`}
                        value={formData.phoneNumber}
                        type="tel"
                        onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    />
                </div>

                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 mt-6">Adresse (Vermieteradresse für Dokumente)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                        label={getLabel('PersonalData', 'Street', 'de')}
                        value={formData.street}
                        onChange={(e) => handleInputChange('street', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'HouseNumber', 'de')}
                        value={formData.houseNumber}
                        onChange={(e) => handleInputChange('houseNumber', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'PostalCode', 'de')}
                        value={formData.postalCode}
                        onChange={(e) => handleInputChange('postalCode', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'City', 'de')}
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                    />
                    <TextField
                        label={getLabel('PersonalData', 'taxIdentificationNumber', 'de')}
                        value={formData.taxIdentificationNumber}
                        onChange={(e) => handleInputChange('taxIdentificationNumber', e.target.value)}
                    />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                    <Button label="Verwerfen" variant="outline" onClick={handleCancel} disabled={!isEditing || isSaving} />
                    <Button
                        label={isSaving ? 'Speichert…' : 'Speichern'}
                        icon={isSaving ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                        variant="primary"
                        onClick={() => void handleSave()}
                        disabled={!isEditing || isSaving}
                    />
                </div>
            </Tile>
        </div>
    );
}
