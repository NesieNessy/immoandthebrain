"use client";

import { Button, Icons, Modal, TextArea, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useState } from 'react';
import { EMPTY_NEW_POST, type NewPostForm } from './useForumData';

export const FORUM_CATEGORIES = ['Allgemein', 'Frage', 'Tipp', 'Ankündigung'];

export function NewPostModal({ open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (form: NewPostForm) => Promise<boolean>;
}) {
    const [form, setForm] = useState<NewPostForm>(EMPTY_NEW_POST);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const set = <K extends keyof NewPostForm>(field: K, value: NewPostForm[K]) => setForm((prev) => ({ ...prev, [field]: value }));

    const canSubmit = form.category.trim() !== '' && form.title.trim() !== '' && form.body.trim() !== '';

    const handleClose = () => {
        setForm(EMPTY_NEW_POST);
        onClose();
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const ok = await onSubmit(form);
        setIsSubmitting(false);
        if (ok) {
            setForm(EMPTY_NEW_POST);
            onClose();
        }
    };

    return (
        <Modal
            open={open}
            onClose={handleClose}
            title="Neuer Beitrag"
            icon={<Icons.Plus className="w-5 h-5" />}
            footer={
                <>
                    <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={handleClose} />
                    <Button
                        label="Veröffentlichen"
                        icon={<Icons.Plus className="w-4 h-4" />}
                        variant="primary"
                        disabled={!canSubmit || isSubmitting}
                        onClick={() => void handleSubmit()}
                    />
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div>
                    <label className="block mb-2 text-sm font-medium text-foreground">Kategorie</label>
                    <div className="flex flex-wrap gap-2">
                        {FORUM_CATEGORIES.map((category) => (
                            <button
                                key={category}
                                type="button"
                                onClick={() => set('category', category)}
                                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${form.category === category ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>
                <TextField label="Titel" value={form.title} onChange={(e) => set('title', e.target.value)} />
                <TextArea label="Beitrag" placeholder="Worüber möchtest du sprechen?" value={form.body} onChange={(e) => set('body', e.target.value)} />
            </div>
        </Modal>
    );
}
