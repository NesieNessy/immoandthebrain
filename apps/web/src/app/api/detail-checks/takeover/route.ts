import { STATE_NAMES } from '@/lib/detailCheck/acquisitionCosts';
import type { RenovationCase } from '@/lib/detailCheck/renovation';
import { buildTakeoverPlan, takeoverBlockers } from '@/lib/detailCheck/takeover';
import { apiError } from '@/lib/server/apiError';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { loadStateForPostalCode } from '@/lib/server/postalCodeState';
import { copyStorageObject, removeStorageObjects } from '@/lib/server/storage';
import { NextResponse } from 'next/server';
import type { PoolClient } from 'pg';

export const dynamic = 'force-dynamic';

const DOCUMENTS_BUCKET = 'documents';
const SETTLEMENT_BUCKET = 'tenancy-documents';

async function stepRow(userId: string, workflowId: string, table: string) {
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE user_id = $1 AND workflow_id = $2`, [userId, workflowId]);
  return rows[0] ?? null;
}

/** First row of a 1:n child table, or null. */
async function firstId(client: PoolClient, table: string, idColumn: string, propertyId: number, orderBy = idColumn) {
  const { rows } = await client.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE property_id = $1 ORDER BY ${orderBy} LIMIT 1`,
    [propertyId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * "In Bestandsobjekte übernehmen": turns a Detailbewertung into a
 * Bestandsobjekt in one transaction — Objektdaten, Kaufkosten, Soll-Mieten,
 * Finanzierung, RND/Kaufpreisaufteilung, Sanierungsmaßnahmen and documents
 * (mapping: lib/detailCheck/takeover.ts). The uploaded Nebenkostenabrechnung
 * becomes the source document of a Nebenkostenabrechnung of the unit.
 *
 * A detail check started from an Ersteinschätzung that was already accepted
 * fills that Bestandsobjekt instead of creating a second one. Taking the same
 * detail check over twice answers 409 with the existing propertyId.
 */
export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;

  let input: { workflowId?: unknown };
  try {
    input = await request.json();
  } catch {
    return apiError(400, 'Ungültige Anfrage.');
  }
  const workflowId = resolveWorkflowId(userId, null, typeof input.workflowId === 'string' ? input.workflowId : null);
  if (workflowId instanceof Response) return workflowId;

  const propertyData = await stepRow(userId, workflowId, 'detail_check_property_data');
  if (!propertyData) return apiError(404, 'Detailbewertung nicht gefunden.');

  const [acquisition, rental, financing, depreciation, renovation] = await Promise.all([
    stepRow(userId, workflowId, 'detail_check_acquisition_costs'),
    stepRow(userId, workflowId, 'detail_check_rental'),
    stepRow(userId, workflowId, 'detail_check_financing'),
    stepRow(userId, workflowId, 'detail_check_depreciation'),
    stepRow(userId, workflowId, 'detail_check_renovation'),
  ]);

  const plan = buildTakeoverPlan({
    propertyData,
    acquisition,
    rental,
    financing,
    depreciation,
    renovationCases: Array.isArray(renovation?.cases) ? renovation.cases as RenovationCase[] : [],
  });
  const blockers = takeoverBlockers(plan);
  if (blockers.length > 0) {
    return apiError(400, `Bitte ergänze in den Objektdaten zuerst: ${blockers.join(', ')}.`, { missing: blockers });
  }
  const stateCode = await loadStateForPostalCode(plan.property.postalCode);
  const federalState = stateCode ? STATE_NAMES[stateCode] : null;

  const client = await db.connect();
  let propertyId: number;
  let settlementSource: { name: string; storagePath: string; fileName: string; contentType: string | null } | null = null;
  try {
    await client.query('BEGIN');

    // Locks the detail check, so a double click can't take it over twice.
    const { rows: locked } = await client.query(
      `SELECT pd.taken_over_property_id, p.property_id AS existing_property_id
         FROM detail_check_property_data pd
         LEFT JOIN property p ON p.property_id = pd.taken_over_property_id AND p.user_id = pd.user_id
        WHERE pd.user_id = $1 AND pd.workflow_id = $2
        FOR UPDATE OF pd`,
      [userId, workflowId],
    );
    if (locked[0]?.existing_property_id != null) {
      await client.query('ROLLBACK');
      return apiError(409, 'Diese Detailbewertung wurde bereits in die Bestandsobjekte übernommen.', {
        propertyId: Number(locked[0].existing_property_id),
      });
    }

    // ── Objektdaten ─────────────────────────────────────────────────────────
    const quickCheckId = propertyData.quick_check_id == null ? null : Number(propertyData.quick_check_id);
    let existingPropertyId: number | null = null;
    if (quickCheckId != null) {
      const { rows } = await client.query(
        `SELECT p.property_id FROM quick_check q JOIN property p ON p.property_id = q.property_id AND p.user_id = q.user_id
          WHERE q.quick_check_id = $1 AND q.user_id = $2`,
        [quickCheckId, userId],
      );
      existingPropertyId = rows[0] ? Number(rows[0].property_id) : null;
    }

    const p = plan.property;
    const propertyValues = [
      p.street, p.houseNumber, p.city.trim(), p.postalCode, federalState,
      p.squareMeters, p.yearOfConstruction, p.energyEfficient, p.propertyCategory,
    ];
    if (existingPropertyId != null) {
      // The Ersteinschätzung's Bestandsobjekt only had its rough data — the
      // Detailbewertung's is more complete, so it wins where it has a value.
      await client.query(
        `UPDATE property SET
           street = $3, house_number = COALESCE($4, house_number), city = $5, postal_code = $6,
           federal_state = COALESCE($7, federal_state), square_meters = COALESCE($8, square_meters),
           year_of_construction = $9, energy_efficient = COALESCE($10::energy_efficiency_class, energy_efficient),
           property_category = COALESCE($11, property_category), updated_at = NOW()
         WHERE property_id = $1 AND user_id = $2`,
        [existingPropertyId, userId, ...propertyValues],
      );
      propertyId = existingPropertyId;
    } else {
      const { rows } = await client.query(
        `INSERT INTO property (
           user_id, street, house_number, city, postal_code, federal_state,
           square_meters, year_of_construction, energy_efficient, property_category, number_of_units
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::energy_efficiency_class, $10, 1)
         RETURNING property_id`,
        [userId, ...propertyValues],
      );
      propertyId = Number(rows[0].property_id);
      if (quickCheckId != null) {
        // Accepting the Ersteinschätzung later then reuses this Bestandsobjekt.
        await client.query(
          'UPDATE quick_check SET property_id = $1, updated_at = NOW() WHERE quick_check_id = $2 AND user_id = $3',
          [propertyId, quickCheckId, userId],
        );
      }
    }

    // ── Stellplätze ─────────────────────────────────────────────────────────
    let parkingSpaceId = await firstId(client, 'parking_space', 'parking_space_id', propertyId);
    if (plan.parkingSpaces > 0) {
      if (parkingSpaceId != null) {
        await client.query(
          'UPDATE parking_space SET number_of_parking_spaces = $2, updated_at = NOW() WHERE parking_space_id = $1',
          [parkingSpaceId, plan.parkingSpaces],
        );
      } else {
        const { rows } = await client.query(
          `INSERT INTO parking_space (property_id, parking_space_type, number_of_parking_spaces)
           VALUES ($1, 'OTHER', $2) RETURNING parking_space_id`,
          [propertyId, plan.parkingSpaces],
        );
        parkingSpaceId = Number(rows[0].parking_space_id);
      }
    }

    // ── Kaufkosten ──────────────────────────────────────────────────────────
    if (plan.acquisitionCosts) {
      const a = plan.acquisitionCosts;
      const values = [
        a.purchasePrice, a.pricePerSqm, a.brokerPercent, a.brokerValue, a.notaryPercent, a.notaryValue,
        a.landRegistryPercent, a.landRegistryValue, a.transferTaxPercent, a.transferTaxValue,
        a.totalAncillaryValue, a.totalAncillaryPercent, a.parkingPurchasePrice,
        a.parkingPurchasePrice != null ? parkingSpaceId : null,
      ];
      const acquisitionId = await firstId(client, 'acquisition_costs', 'acquisition_costs_id', propertyId);
      if (acquisitionId != null) {
        await client.query(
          `UPDATE acquisition_costs SET
             property_purchase_price = $2, price_per_sqm = $3, broker = $4, broker_value = $5,
             notary = $6, notary_value = $7, land_registry = $8, land_registry_value = $9,
             real_estate_tax = $10, real_estate_tax_value = $11, total_ancillary_costs_value = $12,
             total_ancillary_costs = $13, parking_space_purchase_price = $14,
             parking_space_id = COALESCE($15, parking_space_id), updated_at = NOW()
           WHERE acquisition_costs_id = $1`,
          [acquisitionId, ...values],
        );
      } else {
        await client.query(
          `INSERT INTO acquisition_costs (
             property_id, property_purchase_price, price_per_sqm, broker, broker_value,
             notary, notary_value, land_registry, land_registry_value,
             real_estate_tax, real_estate_tax_value, total_ancillary_costs_value,
             total_ancillary_costs, parking_space_purchase_price, parking_space_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [propertyId, ...values],
        );
      }
    }

    // ── Vermietung → Einheit "Gesamtes Objekt" ──────────────────────────────
    const u = plan.unit;
    let unitId = await firstId(client, 'property_unit', 'property_unit_id', propertyId, 'sort_order, property_unit_id');
    if (unitId != null) {
      await client.query(
        `UPDATE property_unit SET
           living_area_m2 = COALESCE($2, living_area_m2),
           year_of_construction = COALESCE($3, year_of_construction),
           energy_efficient = COALESCE($4, energy_efficient),
           number_of_parking_spaces = $5,
           target_cold_rent = COALESCE($6, target_cold_rent),
           target_parking_rent = COALESCE($7, target_parking_rent),
           target_ancillary_costs = COALESCE($8, target_ancillary_costs),
           updated_at = NOW()
         WHERE property_unit_id = $1`,
        [unitId, u.livingAreaM2, u.yearOfConstruction, u.energyEfficient, u.numberOfParkingSpaces,
          u.targetColdRent, u.targetParkingRent, u.targetAncillaryCosts],
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO property_unit (
           property_id, unit_label, sort_order, usage_type, living_area_m2, year_of_construction,
           energy_efficient, number_of_parking_spaces, target_cold_rent, target_parking_rent, target_ancillary_costs
         ) VALUES ($1, 'Gesamtes Objekt', 0, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING property_unit_id`,
        [propertyId, u.usageType, u.livingAreaM2, u.yearOfConstruction, u.energyEfficient,
          u.numberOfParkingSpaces, u.targetColdRent, u.targetParkingRent, u.targetAncillaryCosts],
      );
      unitId = Number(rows[0].property_unit_id);
    }

    // ── Finanzierung ────────────────────────────────────────────────────────
    if (plan.financials) {
      const f = plan.financials;
      await client.query(
        `INSERT INTO property_financials (property_id, loan_amount, equity, interest_rate, repayment_rate, fixed_interest_period_years)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (property_id) DO UPDATE SET
           loan_amount = EXCLUDED.loan_amount, equity = EXCLUDED.equity, interest_rate = EXCLUDED.interest_rate,
           repayment_rate = EXCLUDED.repayment_rate, fixed_interest_period_years = EXCLUDED.fixed_interest_period_years,
           updated_at = NOW()`,
        [propertyId, f.loanAmount, f.equity, f.interestRate, f.repaymentRate, f.fixedInterestPeriodYears],
      );
    }

    // ── Restnutzungsdauer + Kaufpreisaufteilung ─────────────────────────────
    if (plan.rnd) {
      const r = plan.rnd;
      await client.query(
        `INSERT INTO property_rnd (
           property_id, rnd_mode, modernization_roof, modernization_windows, modernization_lines,
           modernization_heating, modernization_facade, modernization_bathrooms, modernization_interior,
           remaining_useful_life_years, afa_percent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 50), COALESCE($11, 2))
         ON CONFLICT (property_id) DO UPDATE SET
           rnd_mode = EXCLUDED.rnd_mode, modernization_roof = EXCLUDED.modernization_roof,
           modernization_windows = EXCLUDED.modernization_windows, modernization_lines = EXCLUDED.modernization_lines,
           modernization_heating = EXCLUDED.modernization_heating, modernization_facade = EXCLUDED.modernization_facade,
           modernization_bathrooms = EXCLUDED.modernization_bathrooms, modernization_interior = EXCLUDED.modernization_interior,
           remaining_useful_life_years = EXCLUDED.remaining_useful_life_years, afa_percent = EXCLUDED.afa_percent,
           updated_at = NOW()`,
        [propertyId, r.rndMode, r.modernizationRoof, r.modernizationWindows, r.modernizationLines,
          r.modernizationHeating, r.modernizationFacade, r.modernizationBathrooms, r.modernizationInterior,
          r.remainingUsefulLifeYears, r.afaPercent],
      );
    }
    if (plan.priceSplit) {
      const s = plan.priceSplit;
      await client.query(
        `INSERT INTO property_price_split (property_id, split_mode, plot_area_m2, land_reference_value, co_ownership_numerator, co_ownership_denominator)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (property_id) DO UPDATE SET
           split_mode = EXCLUDED.split_mode, plot_area_m2 = EXCLUDED.plot_area_m2,
           land_reference_value = EXCLUDED.land_reference_value, co_ownership_numerator = EXCLUDED.co_ownership_numerator,
           co_ownership_denominator = EXCLUDED.co_ownership_denominator, updated_at = NOW()`,
        [propertyId, s.splitMode, s.plotAreaM2, s.landReferenceValue, s.coOwnershipNumerator, s.coOwnershipDenominator],
      );
    }

    // ── Sanierung → Handwerkerleistungen ────────────────────────────────────
    if (plan.measures.length > 0) {
      const { rows } = await client.query(
        'SELECT COALESCE(MAX(sort_order), -1) AS max FROM renovation_measure WHERE property_id = $1',
        [propertyId],
      );
      let sortOrder = Number(rows[0].max) + 1;
      for (const m of plan.measures) {
        await client.query(
          `INSERT INTO renovation_measure (
             property_id, sort_order, title, category, description, estimated_cost, budget_min, budget_max,
             published, published_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN NOW() END)`,
          [propertyId, sortOrder++, m.title, m.category, m.description, m.estimatedCost, m.budgetMin, m.budgetMax, m.published],
        );
      }
    }

    // ── Dokumente ───────────────────────────────────────────────────────────
    // Stay linked to the detail check (detail_check_workflow_id) and now also
    // belong to the Bestandsobjekt — the Dokumente page lists them there.
    const { rows: documents } = await client.query(
      `UPDATE document SET property_id = $3, category = 'Bestandsobjekt', updated_at = NOW()
        WHERE user_id = $1 AND detail_check_workflow_id = $2
        RETURNING name, file_name, storage_path, content_type, created_at`,
      [userId, workflowId, propertyId],
    );
    const statement = documents
      .filter((doc) => doc.name === 'Nebenkostenabrechnung')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (statement) {
      settlementSource = {
        name: String(statement.file_name),
        storagePath: String(statement.storage_path),
        fileName: String(statement.file_name),
        contentType: statement.content_type ?? null,
      };
    }

    await client.query(
      'UPDATE detail_check_property_data SET taken_over_property_id = $3, updated_at = NOW() WHERE user_id = $1 AND workflow_id = $2',
      [userId, workflowId, propertyId],
    );
    await client.query('COMMIT');

    // ── Nebenkostenabrechnung ───────────────────────────────────────────────
    // After the commit: the file copy is a network call to Storage and must not
    // hold the transaction open. Failing here doesn't undo the takeover — the
    // document is still on the Bestandsobjekt, only the settlement is missing.
    const warnings: string[] = [];
    if (settlementSource && unitId != null) {
      const created = await createSettlementFromStatement(userId, propertyId, unitId, plan.settlementPeriod, settlementSource);
      if (!created) {
        warnings.push('Die Nebenkostenabrechnung konnte nicht automatisch angelegt werden. Du findest das Dokument unter Dokumente und kannst sie beim Objekt hochladen.');
      }
    }

    return NextResponse.json({ propertyId, warnings }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Details stay in the server log — the response must not expose internals.
    console.error('POST /api/detail-checks/takeover failed:', err);
    return apiError(500, 'Die Detailbewertung konnte nicht übernommen werden. Bitte versuche es erneut.');
  } finally {
    client.release();
  }
}

/**
 * Copies the uploaded statement into the Nebenkostenabrechnung storage
 * (same path scheme as lib/supabase/service_charge_settlement.supabase.ts)
 * and creates the unit's settlement for that period with it attached. A
 * settlement that already exists for the period gets the document only if it
 * has none yet.
 */
async function createSettlementFromStatement(
  userId: string,
  propertyId: number,
  unitId: number,
  period: { start: string; end: string },
  source: { name: string; storagePath: string; fileName: string; contentType: string | null },
): Promise<boolean> {
  const targetPath = `${userId}/service-charge/${propertyId}/${crypto.randomUUID()}-${source.fileName}`;
  const copied = await copyStorageObject({
    fromBucket: DOCUMENTS_BUCKET,
    fromPath: source.storagePath,
    toBucket: SETTLEMENT_BUCKET,
    toPath: targetPath,
    contentType: source.contentType,
  });
  if (!copied) return false;

  try {
    const { rowCount } = await db.query(
      `INSERT INTO service_charge_settlement (property_id, property_unit_id, period_start, period_end, source_document_name, source_document_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (property_unit_id, period_start, period_end) DO UPDATE SET
         source_document_name = EXCLUDED.source_document_name,
         source_document_path = EXCLUDED.source_document_path,
         updated_at = NOW()
       WHERE service_charge_settlement.source_document_path IS NULL`,
      [propertyId, unitId, period.start, period.end, source.name, targetPath],
    );
    if (!rowCount) await removeStorageObjects(SETTLEMENT_BUCKET, [targetPath]);
    return true;
  } catch (err) {
    console.error('takeover: service_charge_settlement insert failed:', err);
    await removeStorageObjects(SETTLEMENT_BUCKET, [targetPath]);
    return false;
  }
}
