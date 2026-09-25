/** First + last initial from a display name (e.g. "Klaus Fischer" → "KF") —
 *  the review-avatar/author-avatar circle used across the Netzwerk tabs.
 *  Mirrors the existing ad-hoc nameInitials() helpers duplicated across
 *  tenant-data/user-settings (see DocumentGeneratorParts.tsx,
 *  useTenantUnitData.tsx, ProfileSection.tsx) — this is the first shared
 *  copy, used only by the new Netzwerk call sites for now. */
export function nameInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}
