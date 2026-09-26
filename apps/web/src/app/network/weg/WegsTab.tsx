"use client";

import { Button, Icons, Modal, Rating, Tag, TextArea, TextFieldWithIcon } from '@/components/ui';
import { deCurrencyFormatter } from '@/lib/utils';
import type { WegWithRating } from '@immoandthebrain/types';
import { useMemo, useState } from 'react';
import { nameInitials } from '../shared/initials';
import { PaginationFooter } from '../shared/PaginationFooter';
import { paginate } from '../shared/pagination';
import { AddWegModal } from './AddWegModal';
import { useWegsData } from './useWegsData';

const PAGE_SIZE = 10;

function euro(value: number | null): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

function WegCard({ weg, expanded, onToggle, data }: {
    weg: WegWithRating;
    expanded: boolean;
    onToggle: () => void;
    data: ReturnType<typeof useWegsData>;
}) {
    const [reviewOpen, setReviewOpen] = useState(false);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    const handleToggle = () => {
        onToggle();
        if (!expanded && !data.reviewsByWeg.has(weg.wegId)) void data.loadReviews(weg.wegId);
    };

    const submitReview = async () => {
        if (rating === 0) return;
        setIsSubmittingReview(true);
        const ok = await data.rateWeg(weg.wegId, rating, comment);
        setIsSubmittingReview(false);
        if (ok) {
            setReviewOpen(false);
            setRating(0);
            setComment('');
        }
    };

    const reviews = data.reviewsByWeg.get(weg.wegId) ?? [];

    return (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
            <button type="button" onClick={handleToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{weg.name}</p>
                    <p className="text-xs text-muted-foreground">Gegründet {weg.foundedYear ?? '–'} · {weg.unitCount ?? '–'} Einheiten</p>
                </div>
                <span className="hidden sm:block w-28 text-sm text-muted-foreground shrink-0">{weg.city}</span>
                <span className="hidden md:block shrink-0"><Tag label={weg.serviceTier} variant="info" size="sm" /></span>
                <div className="hidden lg:flex items-center gap-1.5 w-32 shrink-0">
                    <Rating value={weg.averageRating ?? 0} readonly size="sm" />
                    <span className="text-sm text-muted-foreground">{weg.averageRating != null ? weg.averageRating.toFixed(1) : '–'}</span>
                </div>
                <span className="hidden sm:block w-20 text-sm text-muted-foreground shrink-0 text-right">{weg.reviewCount} Rez.</span>
                <Icons.ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-border p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Angebot</p>
                            <p className="text-foreground">{weg.serviceTier}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Jahresgebühr</p>
                            <p className="text-foreground">{weg.annualFeePerUnit != null ? `ab ${euro(weg.annualFeePerUnit)}/Einheit` : '–'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Reaktionszeit</p>
                            <p className="text-foreground">{weg.responseTimeHours != null ? `${weg.responseTimeHours} h` : '–'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Erreichbarkeit</p>
                            <p className="text-foreground">{weg.reachability ?? '–'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Website</p>
                            {weg.website ? <a href={weg.website.startsWith('http') ? weg.website : `https://${weg.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{weg.website}</a> : <p className="text-foreground">–</p>}
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Kontakt</p>
                            <p className="text-foreground">{weg.phone ?? weg.email ?? '–'}</p>
                        </div>
                    </div>

                    {reviews.length > 0 && (
                        <div className="space-y-2 border-t border-border pt-3">
                            {reviews.map((review) => (
                                <div key={review.wegReviewId} className="flex items-start gap-2.5 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                                        {nameInitials(review.reviewerName)}
                                    </div>
                                    <div className="min-w-0">
                                        <Rating value={review.rating} readonly size="sm" />
                                        {review.comment && <p className="text-foreground mt-0.5">{review.comment}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 border-t border-border pt-3">
                        {(weg.email || weg.phone) && (
                            <a href={weg.email ? `mailto:${weg.email}` : `tel:${weg.phone}`}>
                                <Button label="Kontakt aufnehmen" icon={<Icons.Mail className="w-4 h-4" />} variant="outline" size="sm" />
                            </a>
                        )}
                        <Button label="Bewertung abgeben" icon={<Icons.Star className="w-4 h-4" />} variant="outline" size="sm" onClick={() => setReviewOpen(true)} />
                    </div>
                </div>
            )}

            <Modal
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                title={`${weg.name} bewerten`}
                icon={<Icons.Star className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Abbrechen" variant="outline" onClick={() => setReviewOpen(false)} />
                        <Button label="Speichern" icon={<Icons.Check className="w-4 h-4" />} variant="primary" disabled={rating === 0} loading={isSubmittingReview} onClick={() => void submitReview()} />
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <Rating value={rating} onChange={setRating} size="lg" />
                    <TextArea label="Kommentar" optional placeholder="Ihre Erfahrung mit dieser WEG…" value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
            </Modal>
        </div>
    );
}

export function WegsTab() {
    const data = useWegsData();
    const [search, setSearch] = useState('');
    const [topRatedOnly, setTopRatedOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [expandedWegs, setExpandedWegs] = useState<Set<number>>(new Set());
    const [addOpen, setAddOpen] = useState(false);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        let result = data.wegs.filter((weg) => !query || weg.name.toLowerCase().includes(query) || weg.city.toLowerCase().includes(query));
        if (topRatedOnly) result = result.filter((weg) => (weg.averageRating ?? 0) >= 4);
        return result;
    }, [data.wegs, search, topRatedOnly]);

    const pageItems = paginate(filtered, page, PAGE_SIZE);

    const toggleWeg = (wegId: number) => {
        setExpandedWegs((prev) => {
            const next = new Set(prev);
            if (next.has(wegId)) next.delete(wegId); else next.add(wegId);
            return next;
        });
    };

    if (data.isLoading) {
        return <p className="text-sm text-muted-foreground">Lädt…</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                    <TextFieldWithIcon icon={Icons.Search} placeholder="WEG oder Stadt suchen…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <button
                    type="button"
                    onClick={() => { setTopRatedOnly((v) => !v); setPage(1); }}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm cursor-pointer shrink-0 transition-colors ${topRatedOnly ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                >
                    <Icons.Star className="w-4 h-4" />
                    Top bewertet
                </button>
                <Button label="WEG vorschlagen" icon={<Icons.Plus className="w-4 h-4" />} variant="primary" size="sm" onClick={() => setAddOpen(true)} className="shrink-0" />
            </div>

            {pageItems.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Keine WEGs gefunden.</p>
            ) : (
                <div className="space-y-2">
                    {pageItems.map((weg) => (
                        <WegCard key={weg.wegId} weg={weg} expanded={expandedWegs.has(weg.wegId)} onToggle={() => toggleWeg(weg.wegId)} data={data} />
                    ))}
                </div>
            )}

            <PaginationFooter page={page} onPageChange={setPage} itemCount={filtered.length} pageSize={PAGE_SIZE} />

            <AddWegModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={data.addWeg} />
        </div>
    );
}
