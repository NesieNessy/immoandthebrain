"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createForumPost, getForumPosts, viewForumPost } from '@/lib/supabase/forum_post.supabase';
import type { ForumPostWithAuthor } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

export interface NewPostForm {
    category: string;
    title: string;
    body: string;
}

export const EMPTY_NEW_POST: NewPostForm = { category: '', title: '', body: '' };

export function useForumData() {
    const { user } = useRequireAuth();
    const { showToast } = useToast();
    const [posts, setPosts] = useState<ForumPostWithAuthor[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const loaded = await getForumPosts();
            if (!cancelled) {
                setPosts(loaded);
                setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const createPost = async (form: NewPostForm): Promise<boolean> => {
        if (form.category.trim() === '' || form.title.trim() === '' || form.body.trim() === '') return false;
        const created = await createForumPost({ authorUserId: user?.id ?? '', category: form.category, title: form.title, body: form.body });
        if (!created) {
            showToast('Beitrag konnte nicht erstellt werden.', 'error');
            return false;
        }
        setPosts((prev) => [created, ...prev]);
        showToast('Beitrag veröffentlicht.', 'success');
        return true;
    };

    const openPost = async (postId: number) => {
        const updated = await viewForumPost(postId);
        if (updated) setPosts((prev) => prev.map((p) => (p.forumPostId === postId ? updated : p)));
    };

    return { posts, isLoading, createPost, openPost };
}
