"use client";

import { Icons, Tag, TextFieldWithIcon } from '@/components/ui';
import { deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import type { RenovationMeasureJobListing } from '@immoandthebrain/types';
import { useMemo, useState } from 'react';
import { PaginationFooter } from '../shared/PaginationFooter';
import { paginate } from '../shared/pagination';
import { useContractorsData } from './useContractorsData';

const PAGE_SIZE = 10;

function euro(value: number | null): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

function budgetRange(job: RenovationMeasureJobListing): string {
    if (job.budgetMin != null && job.budgetMax != null) return `${euro(job.budgetMin)} – ${euro(job.budgetMax)}`;
    if (job.budgetMin != null) return `ab ${euro(job.budgetMin)}`;
    if (job.budgetMax != null) return `bis ${euro(job.budgetMax)}`;
    return '–';
}

function JobCard({ job, expanded, onToggle }: {
    job: RenovationMeasureJobListing;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
            <button type="button" onClick={onToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icons.MapPin className="w-3 h-3" /> {job.city}
                    </p>
                </div>
                {job.category && <span className="hidden sm:block shrink-0"><Tag label={job.category} variant="info" size="sm" /></span>}
                <span className="hidden md:block w-40 text-sm text-muted-foreground shrink-0 text-right">{budgetRange(job)}</span>
                <Icons.ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-border p-4 space-y-3">
                    {job.description && <p className="text-sm text-foreground whitespace-pre-wrap">{job.description}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Ort</p>
                            <p className="text-foreground">{job.street}, {job.city}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget</p>
                            <p className="text-foreground">{budgetRange(job)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Wunschtermin</p>
                            <p className="text-foreground">{job.preferredStartDate ? formatDeDate(job.preferredStartDate) : '–'}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function ContractorsTab() {
    const data = useContractorsData();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return data.jobs;
        return data.jobs.filter((job) =>
            job.title.toLowerCase().includes(query) ||
            job.city.toLowerCase().includes(query) ||
            (job.category?.toLowerCase().includes(query) ?? false));
    }, [data.jobs, search]);

    const pageItems = paginate(filtered, page, PAGE_SIZE);

    const toggleJob = (id: number) => {
        setExpandedJobs((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (data.isLoading) {
        return <p className="text-sm text-muted-foreground">Lädt…</p>;
    }

    return (
        <div className="space-y-4">
            <TextFieldWithIcon icon={Icons.Search} placeholder="Titel, Ort oder Kategorie suchen…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />

            {pageItems.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Keine offenen Aufträge gefunden.</p>
            ) : (
                <div className="space-y-2">
                    {pageItems.map((job) => (
                        <JobCard key={job.renovationMeasureId} job={job} expanded={expandedJobs.has(job.renovationMeasureId)} onToggle={() => toggleJob(job.renovationMeasureId)} />
                    ))}
                </div>
            )}

            <PaginationFooter page={page} onPageChange={setPage} itemCount={filtered.length} pageSize={PAGE_SIZE} />
        </div>
    );
}
