import { authFetch } from '@/lib/api/authFetch';

/** One Detailbewertung, as far as linking documents to it is concerned. */
export interface DetailCheckSummary {
  workflowId: string;
  quickCheckId: number | null;
  /** "Straße, Ort" — how the Dokumente page names the linked object. */
  label: string;
}

/** Every Detailbewertung of the user — with or without Ersteinschätzung. */
export async function getDetailCheckSummaries(): Promise<DetailCheckSummary[]> {
  const response = await authFetch('/api/detail-checks', { cache: 'no-store' });
  if (!response.ok) return [];
  const rows = await response.json() as { workflow_id: string; quick_check_id: number | null; street_house_number: string | null; city: string | null }[];
  return rows.map((row) => ({
    workflowId: row.workflow_id,
    quickCheckId: row.quick_check_id,
    label: [row.street_house_number || 'Adresse noch nicht erfasst', row.city].filter(Boolean).join(', '),
  }));
}
