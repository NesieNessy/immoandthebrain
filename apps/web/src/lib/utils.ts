import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Plain number, German locale (e.g. "50" or "2,5"). */
export const deNumberFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Whole-euro amount, German locale (e.g. "1.200") — pair with a trailing "€". */
export const deCurrencyFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "dd.MM.yyyy", falling back to "–" for null/undefined. */
export function formatDeDate(value: string | null | undefined): string {
  if (!value) return '–';
  return format(new Date(value), 'dd.MM.yyyy');
}

/**
 * Saves a generated Blob (docx, csv, …) to the user's device. Unlike
 * `window.open(URL.createObjectURL(blob))` — which browsers handle
 * inconsistently for mime types they can't render inline, sometimes just
 * navigating the tab to a blank page instead of downloading — an anchor with
 * a `download` attribute reliably triggers a save dialog for any blob type.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Converts a raw base64 image string (as stored in `image_base64` DB column)
 * to a usable `data:` URI for <img src>.
 * Returns null if the input is falsy.
 */
export function base64ToDataUri(base64: string | null | undefined): string | null {
  if (!base64) return null;
  // Already a data URI (e.g. "data:image/jpeg;base64,...")
  if (base64.startsWith('data:')) return base64;
  // Detect image type from the base64 prefix bytes
  let mime = 'image/jpeg';
  if (base64.startsWith('/9j/'))       mime = 'image/jpeg';
  else if (base64.startsWith('iVBOR')) mime = 'image/png';
  else if (base64.startsWith('R0lGO')) mime = 'image/gif';
  else if (base64.startsWith('UklGR')) mime = 'image/webp';
  return `data:${mime};base64,${base64}`;
}

/**
 * `property.imageUrl` is now normally a public Storage URL (the current
 * cover image of the property's photo gallery), but rows created before that
 * feature existed may still hold a raw base64 blob — fall back to
 * `base64ToDataUri` for those so old properties keep showing their photo.
 */
export function resolvePropertyImageSrc(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return base64ToDataUri(imageUrl);
}
