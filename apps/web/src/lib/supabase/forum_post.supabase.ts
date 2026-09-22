import { authFetch } from '@/lib/api/authFetch';
import type { ForumPostInsert, ForumPostWithAuthor } from '@immoandthebrain/types';

function toForumPost(row: Record<string, unknown>): ForumPostWithAuthor {
  return {
    forumPostId: row.forum_post_id as number,
    authorUserId: row.author_user_id as string | null,
    category: row.category as string,
    title: row.title as string,
    body: row.body as string,
    viewCount: row.view_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    authorName: row.author_name as string,
  };
}

export async function getForumPosts(): Promise<ForumPostWithAuthor[]> {
  const response = await authFetch('/api/network/forum-posts', { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toForumPost);
}

export async function createForumPost(post: ForumPostInsert): Promise<ForumPostWithAuthor | null> {
  const response = await authFetch('/api/network/forum-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: post.category, title: post.title, body: post.body }),
  });
  if (!response.ok) return null;
  return toForumPost(await response.json());
}

/** Also bumps the post's view_count server-side — see /api/network/forum-posts/[id]. */
export async function viewForumPost(forumPostId: number): Promise<ForumPostWithAuthor | null> {
  const response = await authFetch(`/api/network/forum-posts/${forumPostId}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return toForumPost(await response.json());
}
