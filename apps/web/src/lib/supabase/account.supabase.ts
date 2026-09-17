import { authFetch } from '@/lib/api/authFetch';

export interface DeleteAccountResult {
    success: boolean;
    error: string | null;
}

/** Permanent, irreversible — deletes every property, personal data, and the
 *  Supabase Auth user itself (see /api/account/route.ts). */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
    const response = await authFetch('/api/account', { method: 'DELETE' });
    if (response.ok) return { success: true, error: null };
    const body = await response.json().catch(() => null) as { error?: string } | null;
    return { success: false, error: body?.error ?? 'Konto konnte nicht gelöscht werden.' };
}
