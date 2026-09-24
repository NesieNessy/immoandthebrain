"use client";

import { Button, Icons, Modal, NumberField, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useState } from 'react';
import { EMPTY_NEW_WEG, type NewWegForm } from './useWegsData';

const SERVICE_TIER_OPTIONS = ['All-inklusiv', 'Hausverwaltung', 'HsVw. und NKA'];

export function AddWegModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (form: NewWegForm) => Promise<boolean>;
}) {
    const [form, setForm] = useState<NewWegForm>(EMPTY_NEW_WEG);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const set = <K extends keyof NewWegForm>(field: K, value: NewWegForm[K]) => setForm((prev) => ({ ...prev, [field]: value }));

    const canSubmit = form.name.trim() !== '' && form.city.trim() !== '' && form.serviceTier.trim() !== '';

    const handleClose = () => {
        setForm(EMPTY_NEW_WEG);
        onClose();
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const ok = await onSubmit(form);
        setIsSubmitting(false);
        if (ok) {
            setForm(EMPTY_NEW_WEG);
            onClose();
        }
    };

    return (
        <Modal
            open={open}
            onClose={handleClose}
            title="WEG vorschlagen"
            icon={<Icons.Plus className="w-5 h-5" />}
            footer={
                <>
                    <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={handleClose} />
                    <Button
                        label="Vorschlagen"
                        icon={<Icons.Plus className="w-4 h-4" />}
                        variant="primary"
                        disabled={!canSubmit || isSubmitting}
                        onClick={() => void handleSubmit()}
                    />
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <TextField label="Name der WEG" placeholder="z.B. WEG Rundumsorglos" value={form.name} onChange={(e) => set('name', e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                    <TextField label="Stadt" value={form.city} onChange={(e) => set('city', e.target.value)} />
                    <NumberField label="Gegründet" optional min={1800} value={form.foundedYear} onChange={(e) => set('foundedYear', e.target.value)} />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium text-foreground">Angebot</label>
                    <div className="flex flex-wrap gap-2">
                        {SERVICE_TIER_OPTIONS.map((tier) => (
                            <button
                                key={tier}
                                type="button"
                                onClick={() => set('serviceTier', tier)}
                                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${form.serviceTier === tier ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                            >
                                {tier}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <NumberField label="Einheiten" optional min={0} value={form.unitCount} onChange={(e) => set('unitCount', e.target.value)} />
                    <NumberField label="Jahresgebühr / Einheit" optional unit="€" min={0} value={form.annualFeePerUnit} onChange={(e) => set('annualFeePerUnit', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <NumberField label="Reaktionszeit" optional unit="h" min={0} value={form.responseTimeHours} onChange={(e) => set('responseTimeHours', e.target.value)} />
                    <TextField label="Erreichbarkeit" optional placeholder="Mo–Fr 8–18 Uhr" value={form.reachability} onChange={(e) => set('reachability', e.target.value)} />
                </div>
                <TextField label="Website" optional placeholder="www.beispiel.de" value={form.website} onChange={(e) => set('website', e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                    <TextField label="Telefon" optional value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                    <TextField label="E-Mail" optional type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                </div>
            </div>
        </Modal>
    );
}
