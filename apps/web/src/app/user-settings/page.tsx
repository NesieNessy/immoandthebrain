"use client";

import { Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, StickyActionBar, TextField, Tile, useToast } from '@/components/ui';
import { authBypassUser, isAuthBypassEnabled } from '@/lib/auth/authBypass';
import { supabase } from '@/lib/supabase/client.supabase';
import { getPersonalData, PersonalDataSaveError, upsertPersonalData } from '@/lib/supabase/personal_data.supabase';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { getLabel } from '@/constants/FieldLabels';
import type { PersonalData } from '@immonext/types';
import { Save } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

const emptyForm = {
    firstName: '',
    lastName: '',
    emailAddress: '',
    phoneNumber: '',
    street: '',
    houseNumber: '',
    postalCode: '',
    city: '',
    taxIdentificationNumber: '',
};

type FormData = typeof emptyForm;

/** Maps the API's snake_case `missing` column names to FieldLabels keys, so a
 *  validation failure can tell the user exactly which field is empty instead
 *  of a generic "Fehler beim Speichern". */
const MISSING_FIELD_LABEL_KEYS: Record<string, string> = {
    last_name: 'LastName',
    first_name: 'FirstName',
    street: 'Street',
    house_number: 'HouseNumber',
    city: 'City',
    postal_code: 'PostalCode',
    phone_number: 'PhoneNumber',
    email_address: 'EmailAddress',
    tax_identification_number: 'taxIdentificationNumber',
};

function SettingsPageContent() {
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const isOnboarding = searchParams.get('onboarding') === '1';
    const [user, setUser] = useState<{ id: string } | null>(null);
    const [formData, setFormData] = useState<FormData>(emptyForm);
    const [savedData, setSavedData] = useState<FormData>(emptyForm);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toFormData = (data: PersonalData): FormData => ({
        firstName: data.firstName,
        lastName: data.lastName,
        emailAddress: data.emailAddress,
        phoneNumber: data.phoneNumber ?? '',
        street: data.street,
        houseNumber: data.houseNumber,
        postalCode: data.postalCode,
        city: data.city,
        taxIdentificationNumber: data.taxIdentificationNumber,
    });

    const loadData = useCallback(async (uid: string, authEmail: string) => {
        setIsLoading(true);
        setError(null);
        const data = await getPersonalData(uid);
        if (data) {
            const form = toFormData(data);
            setFormData(form);
            setSavedData(form);
        } else if (authEmail) {
            // First-time save (no personal_data row yet) — prefill the email
            // we already know from the logged-in Supabase user so it doesn't
            // silently block the required-fields check on an empty value.
            const form = { ...emptyForm, emailAddress: authEmail };
            setFormData(form);
            setSavedData(form);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (isAuthBypassEnabled()) {
            setUser(authBypassUser);
            setFormData({
                ...emptyForm,
                firstName: 'ImmoNext',
                lastName: 'Dev User',
                emailAddress: authBypassUser.email ?? 'dev@immonext.local',
            });
            setSavedData({
                ...emptyForm,
                firstName: 'ImmoNext',
                lastName: 'Dev User',
                emailAddress: authBypassUser.email ?? 'dev@immonext.local',
            });
            setIsLoading(false);
            return;
        }

        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser(data.user);
                loadData(data.user.id, data.user.email ?? '');
            } else {
                setIsLoading(false);
            }
        });
    }, [loadData]);

    const handleInputChange = (field: keyof FormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (!isEditing) setIsEditing(true);
    };

    const handleCancel = () => {
        setFormData(savedData);
        setIsEditing(false);
        setError(null);
    };

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        setError(null);
        try {
            const result = await upsertPersonalData({
                userId: user.id,
                firstName: formData.firstName,
                lastName: formData.lastName,
                emailAddress: formData.emailAddress,
                phoneNumber: formData.phoneNumber || undefined,
                street: formData.street,
                houseNumber: formData.houseNumber,
                postalCode: formData.postalCode,
                city: formData.city,
                taxIdentificationNumber: formData.taxIdentificationNumber,
            });
            const updated = toFormData(result);
            setSavedData(updated);
            setFormData(updated);
            setIsEditing(false);
            showToast('Einstellungen gespeichert.');
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

    if (isLoading) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[{ label: 'Benutzereinstellungen' }]}
                />

                {isOnboarding && (
                    <div className="p-4 bg-info/10 border border-info/30 rounded-lg text-info text-sm">
                        Bitte vervollständigen Sie zunächst Ihre Benutzereinstellungen, bevor Sie ImmoNext nutzen können.
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                        {error}
                    </div>
                )}

                <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <Tile title="Persönliche Informationen">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
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
                                className="sm:col-span-2"
                            />
                            <TextField
                                label={getLabel('PersonalData', 'PhoneNumber', 'de')}
                                value={formData.phoneNumber}
                                type="tel"
                                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                                className="sm:col-span-2"
                            />
                        </div>
                    </Tile>

                    {/* Address */}
                    <Tile title="Adresse">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
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
                        </div>
                    </Tile>

                    {/* Tax */}
                    <Tile title="Steuer" className="lg:col-span-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                            <TextField
                                label={getLabel('PersonalData', 'taxIdentificationNumber', 'de')}
                                value={formData.taxIdentificationNumber}
                                onChange={(e) => handleInputChange('taxIdentificationNumber', e.target.value)}
                            />
                        </div>
                    </Tile>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={handleCancel}
                onPrimary={handleSave}
                ghostLabel={BUTTON_DETAILS.Back.label}
                primaryLabel="Einstellungen speichern"
                ghostIcon={<BUTTON_DETAILS.Back.icon size={20} />}
                primaryIcon={isSaving ? <Icons.Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                primaryDisabled={!isEditing || isSaving}
            />
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={null}>
            <SettingsPageContent />
        </Suspense>
    );
}
