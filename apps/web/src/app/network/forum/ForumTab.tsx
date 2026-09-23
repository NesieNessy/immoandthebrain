"use client";

import { Button, Icons, Tag, TextFieldWithIcon } from '@/components/ui';
import { formatDeDate } from '@/lib/utils';
import type { ForumPostWithAuthor } from '@immoandthebrain/types';
import { useMemo, useState } from 'react';
import { nameInitials } from '../shared/initials';
import { PaginationFooter } from '../shared/PaginationFooter';
import { paginate } from '../shared/pagination';
import { FORUM_CATEGORIES, NewPostModal } from './NewPostModal';
import type { useForumData } from './useForumData';

const PAGE_SIZE = 10;

function PostCard({ post, expanded, onToggle }: {
    post: ForumPostWithAuthor;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
            <button type="button" onClick={onToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {nameInitials(post.authorName)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.authorName} · {formatDeDate(post.createdAt)}</p>
                </div>
                <span className="hidden sm:block shrink-0"><Tag label={post.category} variant="info" size="sm" /></span>
                <span className="hidden md:flex items-center gap-1 w-16 text-sm text-muted-foreground shrink-0">
                    <Icons.Eye className="w-3.5 h-3.5" /> {post.viewCount}
                </span>
                <Icons.ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-border p-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{post.body}</p>
                </div>
            )}
        </div>
    );
}

export function ForumTab({ data }: { data: ReturnType<typeof useForumData> }) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());
    const [newPostOpen, setNewPostOpen] = useState(false);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        let result = data.posts.filter((post) => !query || post.title.toLowerCase().includes(query) || post.body.toLowerCase().includes(query));
        if (category) result = result.filter((post) => post.category === category);
        return result;
    }, [data.posts, search, category]);

    const pageItems = paginate(filtered, page, PAGE_SIZE);

    const togglePost = (postId: number) => {
        setExpandedPosts((prev) => {
            const next = new Set(prev);
            if (next.has(postId)) next.delete(postId); else next.add(postId);
            return next;
        });
        if (!expandedPosts.has(postId)) void data.openPost(postId);
    };

    if (data.isLoading) {
        return <p className="text-sm text-muted-foreground">Lädt…</p>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                    <TextFieldWithIcon icon={Icons.Search} placeholder="Beiträge durchsuchen…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    {FORUM_CATEGORIES.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => { setCategory((prev) => (prev === c ? null : c)); setPage(1); }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${category === c ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                <Button label="Neuer Beitrag" icon={<Icons.Plus className="w-4 h-4" />} variant="primary" size="sm" onClick={() => setNewPostOpen(true)} className="shrink-0" />
            </div>

            {pageItems.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Keine Beiträge gefunden.</p>
            ) : (
                <div className="space-y-2">
                    {pageItems.map((post) => (
                        <PostCard key={post.forumPostId} post={post} expanded={expandedPosts.has(post.forumPostId)} onToggle={() => togglePost(post.forumPostId)} />
                    ))}
                </div>
            )}

            <PaginationFooter page={page} onPageChange={setPage} itemCount={filtered.length} pageSize={PAGE_SIZE} />

            <NewPostModal open={newPostOpen} onClose={() => setNewPostOpen(false)} onSubmit={data.createPost} />
        </div>
    );
}
