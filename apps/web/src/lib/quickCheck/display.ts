// ---------------------------------------------------------------------------
// Quick Check display/validation logic — row→entry mapping, condition/status
// maps, and the create/edit form's validation rules. Re-exported from
// components/features/QuickCheckDisplay.tsx (which adds the one JSX piece,
// KpfBadge) so existing imports of that module keep working. Kept as plain
// .ts (no JSX) so it's importable from .test.ts files — the app's vitest
// config runs in a JSX-free node environment on purpose (see
// vitest.config.mts).
// ---------------------------------------------------------------------------

import type { TagVariant } from '@/components/ui';
import type { QuickCheckOverview } from '@/lib/supabase/quick_check.supabase';
import { isValidConstructionYear } from './validation';
import { PropertyCondition } from '@immonext/types';

export interface QuickCheckEntry extends Record<string, unknown> {
  id: number;
  /** Raw ISO timestamp — not displayed, only used as the default sort key
   *  (ISO 8601 strings sort correctly lexicographically; a reformatted
   *  dd.MM.yy string would not, across month/year boundaries). */
  ingestDate: string;
  portalId: string;
  kpfMultiplier: number | null;
  purchasePrice: number;
  postalCode: string;
  constructionYear: number;
  condition: PropertyCondition;
  detailCheck: boolean;
  status: 'aktiv' | 'inaktiv';
  recommendationScore: number | null;
  recommendationLevel: string | null;
}

export const MANUAL_ENTRY_LABEL = 'Manuelle Erfassung';

export function toEntry(row: QuickCheckOverview): QuickCheckEntry {
  return {
    id:               row.quickCheckId,
    ingestDate:       row.ingestDate,
    portalId:         row.portalId ?? MANUAL_ENTRY_LABEL,
    kpfMultiplier:    row.kpfMultiplier,
    purchasePrice:    row.purchasePrice,
    postalCode:       row.postalCode,
    constructionYear: row.yearOfConstruction,
    condition:        row.condition,
    detailCheck:      row.detailCheck,
    status:           row.status === 'ACTIVE' ? 'aktiv' : 'inaktiv',
    recommendationScore: row.recommendationScore,
    recommendationLevel: row.recommendationLevel,
  };
}

// ── Condition → Tag variant ─────────────────────────────────────────────────

export const conditionVariant: Record<PropertyCondition, TagVariant> = {
  [PropertyCondition.Upscale]:            'purple',
  [PropertyCondition.Standard]:           'teal',
  [PropertyCondition.Luxury]:             'violet',
  [PropertyCondition.InNeedOfRenovation]: 'orange',
};

/** Dropdown options for the create/edit forms — includes a placeholder. */
export const CONDITION_OPTIONS = [
  { value: '', label: 'Bitte wählen...' },
  ...Object.values(PropertyCondition).map((v) => ({ value: v, label: v })),
];

export const CONDITION_FILTER_OPTIONS = Object.values(PropertyCondition).map((v) => ({ value: v, label: v }));
export const STATUS_FILTER_OPTIONS = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'inaktiv', label: 'Inaktiv' },
];

/** Shorter labels for the mobile condition-filter pills (limited width). */
export const CONDITION_PILL_LABEL: Record<PropertyCondition, string> = {
  [PropertyCondition.InNeedOfRenovation]: 'Sanierung',
  [PropertyCondition.Standard]:           'Standard',
  [PropertyCondition.Upscale]:            'Gehoben',
  [PropertyCondition.Luxury]:             'Luxus',
};

// Portal import isn't implemented yet — quick_check.portal_id is a free-text
// field the user fills in to note where a listing came from. Real data is a
// mix of: a full domain they actually typed ("immobilienscout24.de"), or a
// plain text label with no domain in it at all ("Kleinanzeigen",
// "ImmoScout 428", "ImmoWelt"). This used to fabricate a link by cycling
// through three hardcoded portal domains keyed off row.id % 3, so a
// "Kleinanzeigen" row could link to immowelt.de purely by chance — the
// destination had nothing to do with what was actually entered.
//
// Priority order:
//  1. Already a full URL (has a scheme) -> use it verbatim.
//  2. Looks like a real domain, with or without a path ("immoscout24.de",
//     "www.kleinanzeigen.de/s-anzeige/…") -> use exactly what the user typed,
//     just adding the https:// scheme. This is the real link the user
//     inserted — preserving it (path and all) beats replacing it with a
//     generic homepage.
//  3. Otherwise, a plain text label naming a known portal ("Kleinanzeigen",
//     "ImmoScout 428") -> no real link was entered, so send the user to that
//     portal's real homepage instead of a fabricated one.
//  4. No known portal recognized -> no link at all, same as a manual entry.
const DOMAIN_LIKE = /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

const KNOWN_PORTAL_DOMAINS: { pattern: RegExp; url: string }[] = [
  { pattern: /immobilienscout|immoscout/i, url: 'https://www.immobilienscout24.de' },
  { pattern: /immowelt/i, url: 'https://www.immowelt.de' },
  { pattern: /immonet/i, url: 'https://www.immonet.de' },
  { pattern: /kleinanzeigen/i, url: 'https://www.kleinanzeigen.de' },
];

export function getPlaceholderPortalUrl(row: QuickCheckEntry): string | null {
  if (row.portalId === MANUAL_ENTRY_LABEL || row.status === 'inaktiv') return null;

  const value = row.portalId.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (DOMAIN_LIKE.test(value)) return `https://${value}`;
  return KNOWN_PORTAL_DOMAINS.find((p) => p.pattern.test(value))?.url ?? null;
}

// ── Create/edit form validation — shared by quick-check/new and
//    QuickCheckResultView, whose forms have identical fields and rules. ────

export interface QuickCheckFormFields {
  street: string;
  postalCode: string;
  city: string;
  purchasePrice: string;
  coldRent: string;
  yearOfConstruction: string;
}

/**
 * Per-field validation messages — only populated once a field has been
 * touched (non-empty), so a fresh form doesn't show errors immediately.
 * `purchasePrice`/`coldRent` are passed pre-parsed since callers already
 * need the numeric values for the KPF calculation.
 */
export function getQuickCheckFieldErrors(
  fields: QuickCheckFormFields,
  purchasePrice: number,
  coldRent: number,
  currentYear: number
) {
  return {
    street:
      fields.street.length > 0 && fields.street.trim().length > 120
        ? 'Maximal 120 Zeichen'
        : '',
    postalCode:
      fields.postalCode.length > 0 && !/^\d{5}$/.test(fields.postalCode)
        ? 'Genau 5 Ziffern erforderlich'
        : '',
    city:
      fields.city.length > 0 && fields.city.trim().length > 120
        ? 'Maximal 120 Zeichen'
        : '',
    purchasePrice:
      fields.purchasePrice !== '' && purchasePrice <= 0
        ? 'Muss größer als 0 sein'
        : '',
    coldRent:
      fields.coldRent !== '' && coldRent <= 0
        ? 'Muss größer als 0 sein'
        : '',
    yearOfConstruction:
      fields.yearOfConstruction !== '' && !isValidConstructionYear(parseInt(fields.yearOfConstruction, 10), currentYear)
        ? `Zwischen 1850 und ${currentYear}`
        : '',
  };
}
