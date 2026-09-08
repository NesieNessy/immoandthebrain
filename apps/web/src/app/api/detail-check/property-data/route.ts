import { db } from '@/lib/server/db';
import { requireUserId, workflowIdFor } from '@/lib/server/auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

// Mirrors PROPERTY_CATEGORY_CREATE_OPTIONS in components/features/PropertyDisplay.tsx —
// the same categories the existing-properties creation form offers.
const PROPERTY_CATEGORIES = new Set([
  'EIGENTUMSWOHNUNG', 'EINFAMILIENHAUS', 'MEHRFAMILIENHAUS', 'DOPPELHAUS',
  'GEWERBE', 'GRUNDSTUECK', 'HOLZBAUWEISE', 'DENKMALGESCHUETZT',
]);
const DATA_ENTRY_SOURCES = new Set(['PORTAL_IMPORT', 'MANUELL']);
const TENANCY_TYPES = new Set(['STANDARD', 'INDEXMIETE']);
const ENERGY_CLASSES = new Set(['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadQuickCheck(userId: string, quickCheckId: string | null) {
  if (!quickCheckId) return null;

  const { rows } = await db.query(
    `
      SELECT quick_check_id, street, postal_code, city, year_of_construction, data_entry_source
      FROM quick_check
      WHERE user_id = $1
        AND quick_check_id = $2
      LIMIT 1
    `,
    [userId, Number(quickCheckId)],
  );

  return rows[0] ?? null;
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const quickCheckId = url.searchParams.get('quickCheckId');
  const requestedWorkflowId = url.searchParams.get('workflowId');
  const workflowId = workflowIdFor(userId, quickCheckId, requestedWorkflowId);
  const quickCheck = await loadQuickCheck(userId, quickCheckId);

  const { rows } = quickCheckId || requestedWorkflowId ? await db.query(
    `
      SELECT *
      FROM detail_check_property_data
      WHERE user_id = $1
        AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  ) : { rows: [] };

  const saved = rows[0];

  return NextResponse.json({
    workflowId,
    quickCheckId: quickCheck?.quick_check_id ?? null,
    hasDetailCheckData: Boolean(saved),
    propertyCategory: saved?.property_category ?? 'EIGENTUMSWOHNUNG',
    dataEntrySource: saved?.data_entry_source ?? quickCheck?.data_entry_source ?? '',
    tenancyType: saved?.tenancy_type ?? '',
    sourceUrl: saved?.source_url ?? '',
    streetHouseNumber: saved?.street_house_number ?? quickCheck?.street ?? '',
    postalCode: saved?.postal_code ?? quickCheck?.postal_code ?? '',
    city: saved?.city ?? quickCheck?.city ?? '',
    yearOfConstruction: saved?.year_of_construction ?? quickCheck?.year_of_construction ?? '',
    livingAreaM2: saved?.living_area_m2 == null ? '' : toNumber(saved.living_area_m2),
    parkingSpaces: saved?.parking_spaces ?? 0,
    energyEfficiency: saved?.energy_efficiency ?? '',
  });
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const quickCheckId = input.quickCheckId ? String(input.quickCheckId) : null;
  const requestedWorkflowId = input.workflowId ? String(input.workflowId) : null;
  const workflowId = quickCheckId || requestedWorkflowId
    ? workflowIdFor(userId, quickCheckId, requestedWorkflowId)
    : `detail-check:${randomUUID()}`;
  const quickCheck = await loadQuickCheck(userId, quickCheckId);

  const propertyCategory = String(input.propertyCategory ?? '');
  const dataEntrySource = String(input.dataEntrySource ?? '');
  const tenancyType = String(input.tenancyType ?? '');
  const city = String(input.city ?? '').trim();
  const yearOfConstruction = toNumber(input.yearOfConstruction);
  const livingAreaM2 = toNumber(input.livingAreaM2);
  const parkingSpaces = toNumber(input.parkingSpaces);
  const postalCode = String(input.postalCode ?? '').trim();
  const streetHouseNumber = String(input.streetHouseNumber ?? '').trim();
  const sourceUrl = String(input.sourceUrl ?? '').trim();
  const energyEfficiency = String(input.energyEfficiency ?? '').trim();
  const currentYear = new Date().getFullYear();

  const fieldErrors: Record<string, string> = {};
  if (!PROPERTY_CATEGORIES.has(propertyCategory)) fieldErrors.propertyCategory = 'Bitte wählen Sie eine Objektkategorie.';
  if (!DATA_ENTRY_SOURCES.has(dataEntrySource)) fieldErrors.dataEntrySource = 'Bitte wählen Sie eine Erfassungsquelle.';
  if (!TENANCY_TYPES.has(tenancyType)) fieldErrors.tenancyType = 'Bitte wählen Sie eine Miet-/Nutzungsart.';
  if (dataEntrySource === 'PORTAL_IMPORT' && sourceUrl) {
    try {
      new URL(sourceUrl);
    } catch {
      fieldErrors.sourceUrl = 'Bitte eine gültige URL eingeben.';
    }
  }
  if (streetHouseNumber.length > 100) fieldErrors.streetHouseNumber = 'Maximal 100 Zeichen.';
  if (postalCode && !/^\d{4,5}$/.test(postalCode)) fieldErrors.postalCode = 'Bitte 4 bis 5 Ziffern eingeben.';
  if (!city || city.length > 100) fieldErrors.city = 'Ort ist ein Pflichtfeld.';
  if (!Number.isInteger(yearOfConstruction) || yearOfConstruction < 1000 || yearOfConstruction > currentYear) {
    fieldErrors.yearOfConstruction = `Baujahr muss zwischen 1000 und ${currentYear} liegen.`;
  }
  if (livingAreaM2 <= 0 || livingAreaM2 > 10000) {
    fieldErrors.livingAreaM2 = 'Wohnfläche muss größer als 0 und maximal 10.000 sein.';
  }
  if (!Number.isInteger(parkingSpaces) || parkingSpaces < 0 || parkingSpaces > 10) {
    fieldErrors.parkingSpaces = 'Bitte 0 bis 10 Stellplätze wählen.';
  }
  if (energyEfficiency && !ENERGY_CLASSES.has(energyEfficiency)) {
    fieldErrors.energyEfficiency = 'Bitte eine gültige Energieeffizienz wählen.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO detail_check_property_data (
          user_id,
          quick_check_id,
          workflow_id,
          property_category,
          data_entry_source,
          tenancy_type,
          source_url,
          street_house_number,
          postal_code,
          city,
          year_of_construction,
          living_area_m2,
          parking_spaces,
          energy_efficiency
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (user_id, workflow_id) DO UPDATE SET
          quick_check_id = EXCLUDED.quick_check_id,
          property_category = EXCLUDED.property_category,
          data_entry_source = EXCLUDED.data_entry_source,
          tenancy_type = EXCLUDED.tenancy_type,
          source_url = EXCLUDED.source_url,
          street_house_number = EXCLUDED.street_house_number,
          postal_code = EXCLUDED.postal_code,
          city = EXCLUDED.city,
          year_of_construction = EXCLUDED.year_of_construction,
          living_area_m2 = EXCLUDED.living_area_m2,
          parking_spaces = EXCLUDED.parking_spaces,
          energy_efficiency = EXCLUDED.energy_efficiency,
          updated_at = NOW()
      `,
      [
        userId,
        quickCheck?.quick_check_id ?? null,
        workflowId,
        propertyCategory,
        dataEntrySource,
        tenancyType,
        sourceUrl || null,
        streetHouseNumber || null,
        postalCode || null,
        city,
        yearOfConstruction,
        livingAreaM2,
        parkingSpaces,
        energyEfficiency || null,
      ],
    );

    if (quickCheck?.quick_check_id) {
      await client.query(
        `
          UPDATE quick_check
          SET detail_check = TRUE,
              updated_at = NOW()
          WHERE user_id = $1
            AND quick_check_id = $2
        `,
        [userId, quickCheck.quick_check_id],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return NextResponse.json({ status: 'OK', next: 'KAUFKOSTEN', workflowId });
}
