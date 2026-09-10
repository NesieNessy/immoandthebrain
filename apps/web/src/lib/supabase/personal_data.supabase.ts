import { authFetch } from '@/lib/api/authFetch';
import type { PersonalData, PersonalDataInsert, PersonalDataUpdate } from '@immoandthebrain/types';

/** Thrown by `upsertPersonalData`/`updatePersonalData` when the API rejects the
 *  request — carries the raw `missing` column names (snake_case) from the API
 *  so callers can translate them into field labels for the user. */
export class PersonalDataSaveError extends Error {
  missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'PersonalDataSaveError';
    this.missing = missing;
  }
}

function toPersonalData(row: Record<string, unknown>): PersonalData {
  return {
    userId: row.user_id as string,
    lastName: row.last_name as string,
    firstName: row.first_name as string,
    street: row.street as string,
    houseNumber: row.house_number as string,
    city: row.city as string,
    postalCode: row.postal_code as string,
    phoneNumber: row.phone_number as string | undefined,
    emailAddress: row.email_address as string,
    taxIdentificationNumber: row.tax_identification_number as string,
    profilePicture: row.profile_picture as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getPersonalData(userId: string): Promise<PersonalData | null> {
  void userId;
  const response = await authFetch('/api/personal-data', { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json() as Record<string, unknown>;
  return toPersonalData(data);
}

export async function upsertPersonalData(personalData: PersonalDataInsert): Promise<PersonalData> {
  const response = await authFetch('/api/personal-data', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(personalData),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; missing?: string[] } | null;
    throw new PersonalDataSaveError(body?.error ?? 'Fehler beim Speichern.', body?.missing ?? []);
  }
  const data = await response.json() as Record<string, unknown>;
  return toPersonalData(data);
}

export async function updatePersonalData(userId: string, updates: PersonalDataUpdate): Promise<PersonalData | null> {
  void userId;
  const response = await authFetch('/api/personal-data', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  });
  if (!response.ok) return null;
  const data = await response.json() as Record<string, unknown>;
  return toPersonalData(data);
}
