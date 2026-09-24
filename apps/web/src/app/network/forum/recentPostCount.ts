import type { ForumPost } from '@immoandthebrain/types';

/** Number of posts created within the last 7 days — the Forum pill's badge.
 *  Not an "unread" count (this app tracks no read/unread state anywhere);
 *  this is an honest, real number rather than a fabricated one. */
export function recentPostCount(posts: Pick<ForumPost, 'createdAt'>[], now: Date = new Date()): number {
    const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return posts.filter((p) => new Date(p.createdAt).getTime() >= cutoff).length;
}
