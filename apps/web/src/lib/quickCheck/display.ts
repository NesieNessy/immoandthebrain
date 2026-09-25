// Row->entry mapping, condition/status maps, and create/edit form validation.
// Re-exported from components/features/QuickCheckDisplay.tsx (which adds the
// JSX KpfBadge piece). Kept as plain .ts (no JSX) so it stays importable from
// .test.ts files under the JSX-free node vitest config.

import type { TagVariant } from '@/components/ui';
import { listingLinkHref } from '@/lib/listingUrl';
import type { QuickCheckOverview } from '@/lib/supabase/quick_check.supabase';
import { isValidConstructionYear } from './validation';
import { PropertyCondition } from '@immoandthebrain/types';

export interface QuickCheckEntry extends Record<string, unknown> {
  id: number;
  /** Raw ISO timestamp, used only as the sort key — ISO 8601 sorts correctly
   *  lexicographically, unlike a reformatted dd.MM.yy string. */
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

// quick_check.portal_id is free text naming where a listing came from — either
// a real domain/URL the user typed, or a plain label like "Kleinanzeigen".
// Previously this fabricated a link by cycling through 3 hardcoded domains
// keyed off row.id % 3, so the destination had no relation to what was entered.
//
// Priority: (1) already a full URL -> use verbatim; (2) looks like a real
// domain -> keep what the user typed, just add https:// (steps 1-2 share the
// rule in lib/listingUrl.ts, also used by Detailbewertung's Inserats-URL);
// (3) plain label naming a known portal -> link to that portal's homepage;
// (4) unrecognized -> no link, same as a manual entry.
const KNOWN_PORTAL_DOMAINS: { pattern: RegExp; url: string }[] = [
  { pattern: /immobilienscout|immoscout/i, url: 'https://www.immobilienscout24.de' },
  { pattern: /immowelt/i, url: 'https://www.immowelt.de' },
  { pattern: /immonet/i, url: 'https://www.immonet.de' },
  { pattern: /kleinanzeigen/i, url: 'https://www.kleinanzeigen.de' },
];

export function getPlaceholderPortalUrl(row: QuickCheckEntry): string | null {
  if (row.portalId === MANUAL_ENTRY_LABEL || row.status === 'inaktiv') return null;

  const link = listingLinkHref(row.portalId);
  if (link) return link;
  const value = row.portalId.trim();
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
 * Per-field validation messages, populated only once a field is touched so a
 * fresh form shows no errors. purchasePrice/coldRent are pre-parsed since
 * callers already need the numeric values for the KPF calculation.
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
