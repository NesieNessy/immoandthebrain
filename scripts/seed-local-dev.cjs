// Populates the local Supabase DB with a realistic dataset across the app's
// three main areas — Quick Check (Ersteinschätzung), Detail Check
// (Detailbewertung), and Existing Properties (Bestandsobjekte) — for the
// auth-bypass dev user (see apps/web/src/lib/auth/localBypass.ts). Complements
// apps/web/e2e/fixtures/seed.ts, which is a minimal, deliberately separate
// fixture reserved for the e2e suite (street "E2E Teststraße") — this script
// uses different addresses so the two never collide, and is meant to be run
// by hand against a local `supabase start` stack, not from CI/Playwright.
//
// Idempotent: re-running clears this script's own previous rows first (by
// user_id for quick_check/detail_check_*, by street for the properties it
// owns) so repeated runs don't accumulate duplicates.
//
// Usage: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<db-port>/postgres node scripts/seed-local-dev.cjs
// (DATABASE_URL defaults to the port this repo's supabase/config.toml currently uses.)

const { Client } = require('pg');

const USER_ID = '00000000-0000-4000-8000-000000000001';

const DETAIL_CHECK_TABLES = [
    'detail_check_property_data',
    'detail_check_acquisition_costs',
    'detail_check_rental',
    'detail_check_financing',
    'detail_check_depreciation',
    'detail_check_renovation',
    'detail_check_rent_calculator',
    'detail_check_rent_increases',
    'detail_check_location_score',
    'detail_check_comparison',
    'detail_check_recommendation',
];

async function main() {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
        await client.query('BEGIN');

        // ------------------------------------------------------------------
        // Clean slate for this script's own data
        // ------------------------------------------------------------------
        for (const table of DETAIL_CHECK_TABLES) {
            await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [USER_ID]);
        }
        await client.query('DELETE FROM quick_check WHERE user_id = $1', [USER_ID]);
        await client.query(
            "DELETE FROM property WHERE user_id = $1 AND street IN ('Musterstraße', 'Ahornweg')",
            [USER_ID],
        );

        // ------------------------------------------------------------------
        // Existing Properties — Property A (also the accepted-quick-check
        // target below) — one condo unit, currently rented.
        // ------------------------------------------------------------------
        const propA = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, federal_state, square_meters, year_of_construction, number_of_units, property_category)
             VALUES ($1, 'Musterstraße', '5', 'München', '80331', 'Bayern', 85.5, 1990, 1, 'EIGENTUMSWOHNUNG')
             RETURNING property_id`,
            [USER_ID],
        );
        const propertyAId = propA.rows[0].property_id;

        const unitA1 = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms, target_cold_rent)
             VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 85.5, 3, 1200)
             RETURNING property_unit_id`,
            [propertyAId],
        );

        const tenancyA1 = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, warm_rent, misc_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2022-03-01', 1200, 1420, 220, 3600, 'Michael', 'Bauer')
             RETURNING tenancy_id`,
            [propertyAId, unitA1.rows[0].property_unit_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date, tax_id)
             VALUES ($1, 'Michael', 'Bauer', true, 0, '2022-03-01', '65123456789')`,
            [tenancyA1.rows[0].tenancy_id],
        );

        await client.query(
            `INSERT INTO acquisition_costs (property_id, property_purchase_price, price_per_sqm, broker, broker_value, notary, notary_value, land_registry, land_registry_value, real_estate_tax, real_estate_tax_value, total_ancillary_costs, total_ancillary_costs_value)
             VALUES ($1, 450000, 5263, 3.57, 16065, 1.5, 6750, 0.5, 2250, 3.5, 15750, 9.07, 40815)`,
            [propertyAId],
        );
        await client.query(
            `INSERT INTO maintenance_costs (property_id, cost_breakdown, allocable_costs, non_allocable_costs, total_costs, house_money)
             VALUES ($1, false, 2160, 480, 2640, 3000)`,
            [propertyAId],
        );

        // ------------------------------------------------------------------
        // Existing Properties — Property B — independent multi-family
        // building: two rented units (one with two tenants) plus one vacant
        // unit, to exercise hasMultipleUnits / tenant-history / vacancy.
        // ------------------------------------------------------------------
        const propB = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, federal_state, square_meters, year_of_construction, number_of_units, property_category)
             VALUES ($1, 'Ahornweg', '8', 'Leipzig', '04109', 'Sachsen', 210, 1975, 3, 'MEHRFAMILIENHAUS')
             RETURNING property_id`,
            [USER_ID],
        );
        const propertyBId = propB.rows[0].property_id;

        const unitB1 = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms, target_cold_rent)
             VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 58, 2, 520) RETURNING property_unit_id`,
            [propertyBId],
        );
        const unitB2 = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms, target_cold_rent)
             VALUES ($1, 'Whg. 2', 1, 'WOHNUNG', 72, 3, 680) RETURNING property_unit_id`,
            [propertyBId],
        );
        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms, target_cold_rent)
             VALUES ($1, 'Whg. 3', 2, 'WOHNUNG', 80, 3, 750)`,
            [propertyBId],
        );

        const tenancyB1 = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, warm_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2019-06-01', 520, 650, 1560, 'Sabine', 'Hoffmann')
             RETURNING tenancy_id`,
            [propertyBId, unitB1.rows[0].property_unit_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date, tax_id)
             VALUES ($1, 'Sabine', 'Hoffmann', true, 0, '2019-06-01', '65198765432')`,
            [tenancyB1.rows[0].tenancy_id],
        );

        const tenancyB2 = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, warm_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2021-09-01', 680, 830, 2040, 'Thomas', 'Krüger')
             RETURNING tenancy_id`,
            [propertyBId, unitB2.rows[0].property_unit_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date, tax_id)
             VALUES ($1, 'Thomas', 'Krüger', true, 0, '2021-09-01', '65145678901')`,
            [tenancyB2.rows[0].tenancy_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date)
             VALUES ($1, 'Julia', 'Krüger', false, 1, '2021-09-01')`,
            [tenancyB2.rows[0].tenancy_id],
        );
        // Whg. 3 intentionally has no tenancy row — currently vacant.

        await client.query(
            `INSERT INTO maintenance_costs (property_id, cost_breakdown, allocable_costs, non_allocable_costs, total_costs, house_money)
             VALUES ($1, false, 4200, 900, 5100, 6000)`,
            [propertyBId],
        );

        // ------------------------------------------------------------------
        // Handwerker / Sanierungsmaßnahmen — one measure per stage of the
        // detail-page workflow, so every stepper state and both the
        // multi-quote and defects lists have something to show.
        // ------------------------------------------------------------------

        // Property B — fully completed: published, two quotes with one
        // accepted (locking the measure), both completion confirmations set,
        // and a defect logged after the fact.
        const measureBathroom = await client.query(
            `INSERT INTO renovation_measure (
                property_id, sort_order, title, category, description,
                estimated_cost, quoted_cost, preferred_start_date, quoted_start_date, actual_completion_date,
                published, published_at, quote_accepted, craftsman_confirmed_completed, customer_confirmed_completed, craftsman_notes
             )
             VALUES ($1, 0, 'Badezimmer', 'Badezimmer', 'Leichte Schäden im Badezimmer und Fußboden.',
                13500, 14000, '2026-01-01', '2026-02-01', '2026-03-15',
                true, NOW(), true, true, true, 'Rückfrage zum Fliesentyp beantwortet — Feinsteinzeug gewählt.')
             RETURNING renovation_measure_id`,
            [propertyBId],
        );
        const measureBathroomId = measureBathroom.rows[0].renovation_measure_id;
        await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, sort_order, company_name, cost, accepted)
             VALUES ($1, $2, 0, 'Mustermann GmbH', 14000, true)`,
            [measureBathroomId, propertyBId],
        );
        await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, sort_order, company_name, cost, accepted)
             VALUES ($1, $2, 1, 'Handwerk AG', 15500, false)`,
            [measureBathroomId, propertyBId],
        );
        await client.query(
            `INSERT INTO renovation_measure_defect (renovation_measure_id, property_id, sort_order, description)
             VALUES ($1, $2, 0, 'Silikonfuge an der Dusche nachbessern')`,
            [measureBathroomId, propertyBId],
        );

        // Property B — published, two competing quotes still awaiting a
        // decision (nothing accepted yet, so still editable/unlocked).
        const measureWindows = await client.query(
            `INSERT INTO renovation_measure (
                property_id, sort_order, title, category, description,
                estimated_cost, preferred_start_date,
                published, published_at, craftsman_notes
             )
             VALUES ($1, 1, 'Fenster', 'Fenster', '5 Fenster im Wohnzimmer und Schlafzimmer undicht.',
                8000, '2026-06-01',
                true, NOW(), 'Welche Fensterfarbe wird gewünscht — weiß oder anthrazit?')
             RETURNING renovation_measure_id`,
            [propertyBId],
        );
        const measureWindowsId = measureWindows.rows[0].renovation_measure_id;
        await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, sort_order, company_name, cost)
             VALUES ($1, $2, 0, 'Fensterbau Schmidt', 7200)`,
            [measureWindowsId, propertyBId],
        );
        await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, sort_order, company_name, cost)
             VALUES ($1, $2, 1, 'GlasTechnik Nord', 8900)`,
            [measureWindowsId, propertyBId],
        );

        // Property B — earliest stage: just an estimate, not yet published.
        await client.query(
            `INSERT INTO renovation_measure (property_id, sort_order, title, category, estimated_cost, published)
             VALUES ($1, 2, 'Fußboden', 'Fußboden', 6000, false)`,
            [propertyBId],
        );

        // Property A — published with a single quote still under
        // consideration, for coverage on the single-unit property too.
        const measureElectrical = await client.query(
            `INSERT INTO renovation_measure (
                property_id, sort_order, title, category, description,
                estimated_cost, published, published_at
             )
             VALUES ($1, 0, 'Elektrik', 'Elektrik', 'Sicherungskasten veraltet, Steckdosen im Bad fehlen.',
                5000, true, NOW())
             RETURNING renovation_measure_id`,
            [propertyAId],
        );
        await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, sort_order, company_name, cost)
             VALUES ($1, $2, 0, 'Elektro Müller GmbH', 4800)`,
            [measureElectrical.rows[0].renovation_measure_id, propertyAId],
        );

        // ------------------------------------------------------------------
        // Quick Check — three rows spanning the workflow's states: accepted
        // into a property (linked to Property A + a full Detail Check),
        // still under review, and discarded.
        // ------------------------------------------------------------------
        const qc1 = await client.query(
            `INSERT INTO quick_check (user_id, property_id, data_entry_source, purchase_price, cold_rent, street, postal_code, city, year_of_construction, condition, kpf_multiplier, status, finalised_action, detail_check)
             VALUES ($1, $2, 'MANUELL', 450000, 1200, 'Musterstraße 5', '80331', 'München', 1990, 'Standard', 31.3, 'ACTIVE', 'ACCEPT', true)
             RETURNING quick_check_id`,
            [USER_ID, propertyAId],
        );
        const quickCheckId = qc1.rows[0].quick_check_id;

        await client.query(
            `INSERT INTO quick_check (user_id, data_entry_source, purchase_price, cold_rent, street, postal_code, city, year_of_construction, condition, kpf_multiplier, status, detail_check)
             VALUES ($1, 'MANUELL', 280000, 950, 'Beispielweg 12', '50667', 'Köln', 2005, 'Gehoben', 24.6, 'ACTIVE', false)`,
            [USER_ID],
        );
        await client.query(
            `INSERT INTO quick_check (user_id, data_entry_source, purchase_price, cold_rent, street, postal_code, city, year_of_construction, condition, kpf_multiplier, status, finalised_action, detail_check)
             VALUES ($1, 'MANUELL', 620000, 1800, 'Testallee 3', '10115', 'Berlin', 1965, 'Sanierungsbedürftig', 28.7, 'INACTIVE', 'DISCARD', false)`,
            [USER_ID],
        );

        // ------------------------------------------------------------------
        // Detail Check — full set of tables, linked to quick_check #1 via
        // the app's workflow_id convention so the Quick Check overview's
        // recommendation join also picks it up.
        // ------------------------------------------------------------------
        const workflowId = `quick-check:${quickCheckId}`;

        await client.query(
            `INSERT INTO detail_check_property_data (user_id, quick_check_id, workflow_id, property_category, data_entry_source, tenancy_type, street_house_number, postal_code, city, year_of_construction, living_area_m2, parking_spaces, energy_efficiency)
             VALUES ($1, $2, $3, 'EIGENTUMSWOHNUNG', 'MANUELL', 'STANDARD', 'Musterstraße 5', '80331', 'München', 1990, 85.5, 1, 'C')`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_acquisition_costs (user_id, quick_check_id, workflow_id, state, postal_code, living_area_m2, purchase_price, parking_purchase_price)
             VALUES ($1, $2, $3, 'BY', '80331', 85.5, 450000, 15000)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_rental (user_id, quick_check_id, workflow_id, valuation_date, is_rented, source, cold_rent, parking_rent, service_charges_allocable, service_charges_non_allocable, service_charges_total)
             VALUES ($1, $2, $3, '2024-01-15', true, 'MANUELL', 1200, 50, 180, 40, 220)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_financing (user_id, quick_check_id, workflow_id, offer_renovation_costs, offer_equity, offer_interest_rate, repayment_rate)
             VALUES ($1, $2, $3, 15000, 90000, 3.8, 2.5)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_depreciation (user_id, quick_check_id, workflow_id, land_reference_value, plot_area_m2, co_ownership_numerator, co_ownership_denominator, building_value, building_share_percent, land_value, land_share_percent)
             VALUES ($1, $2, $3, 800, 250, 85, 1000, 350000, 78, 100000, 22)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_renovation (user_id, quick_check_id, workflow_id, financed_amount)
             VALUES ($1, $2, $3, 15000)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_rent_calculator (user_id, quick_check_id, workflow_id, start_yyyymm, monthly_rent_start, rent_index_per_m2)
             VALUES ($1, $2, $3, '2024-01', 1200, 12.5)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_rent_increases (user_id, workflow_id, legal_basis, source_type, sequence_number, effective_yyyymm, monthly_amount)
             VALUES ($1, $2, '558', 'RENT_INDEX', 1, '2025-01', 1260)`,
            [USER_ID, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_location_score (user_id, quick_check_id, workflow_id, city, postal_code, street_house_number, total_score, macro_score, micro_score)
             VALUES ($1, $2, $3, 'München', '80331', 'Musterstraße 5', 78, 82, 74)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_comparison (user_id, quick_check_id, workflow_id)
             VALUES ($1, $2, $3)`,
            [USER_ID, quickCheckId, workflowId],
        );
        await client.query(
            `INSERT INTO detail_check_recommendation (user_id, quick_check_id, workflow_id, recommendation_score)
             VALUES ($1, $2, $3, 76)`,
            [USER_ID, quickCheckId, workflowId],
        );

        await client.query('COMMIT');

        console.log('Seeded local dev dataset:');
        console.log(`  Property A (München, from accepted Quick Check #${quickCheckId}): property_id=${propertyAId}`);
        console.log(`  Property B (Leipzig, 3 units incl. 1 vacant):                  property_id=${propertyBId}`);
        console.log('  Quick Checks: 1 accepted+detail-checked, 1 active, 1 discarded');
        console.log(`  Detail Check: workflow_id=${workflowId} (all 11 tables populated)`);
        console.log('  Handwerker: Badezimmer (completed, 2 quotes + defect), Fenster (2 quotes, undecided), Fußboden (draft), Elektrik on Property A (1 quote)');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
