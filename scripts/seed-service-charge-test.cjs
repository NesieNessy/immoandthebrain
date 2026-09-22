// Seeds a dedicated test property for exercising the Nebenkostenabrechnung
// (service charge settlement) feature end-to-end in the browser: a 2-unit
// building so Anteil Wohnung is visibly NOT the same number as Gesamt
// Objekt (60/40 m² split, unlike a single-unit property where the area
// share happens to be 100%), plus two tenancies designed to cover the
// occupancy-proration fix:
//   - Whg. 1: tenant moved in mid-year (2026-04-01, ongoing) — the
//     Vorauszahlung for a 2026 settlement must only cover Apr 1 – Dec 31,
//     not the full year.
//   - Whg. 2: tenant has been there since before 2026 — a full-year control
//     case to compare against.
// No settlement/cost items are pre-created: opening the Nebenkostenabrechnung
// page for either unit loads the standard BetrKV cost-item template fresh,
// so the manual Anteil Wohnung entry, the "Wert vorschlagen" suggestion, the
// separate umlagefähig/nicht-umlagefähig totals, and the save-period
// validation can all be exercised by hand.
//
// Idempotent: re-running deletes this script's own previous property (by
// street name, scoped to its own user) first.
//
// Usage: DATABASE_URL=<connection string> node scripts/seed-service-charge-test.cjs [userId]
// (userId defaults to the account that already owns "Teststraße 123b" in
// this database, i.e. whoever has been testing the NKA feature manually.)

const { Client } = require('pg');

const DEFAULT_USER_ID = '61a299be-f613-470b-b2dd-3d7371da0ed9';
const STREET = 'Teststraße NKA-Test';
const CITY = 'München';
const POSTAL_CODE = '80807';

async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const userId = process.argv[2] || DEFAULT_USER_ID;

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
        await client.query('BEGIN');

        await client.query(
            'DELETE FROM property WHERE user_id = $1 AND street = $2',
            [userId, STREET],
        );

        const property = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, federal_state, year_of_construction, number_of_units, property_category)
             VALUES ($1, $2, '7', $3, $4, 'Bayern', 1985, 2, 'MEHRFAMILIENHAUS')
             RETURNING property_id`,
            [userId, STREET, CITY, POSTAL_CODE],
        );
        const propertyId = property.rows[0].property_id;

        // 60 m² of 100 m² total living area -> this unit's area share is a
        // clean, easy-to-check 60% (not the coincidental 100% a single-unit
        // property would give, which is what originally hid the
        // Gesamtobjekt-copied-into-Anteil-Wohnung bug).
        const unit1 = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms)
             VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 60, 3)
             RETURNING property_unit_id`,
            [propertyId],
        );
        const unit2 = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2, number_of_rooms)
             VALUES ($1, 'Whg. 2', 1, 'WOHNUNG', 40, 2)
             RETURNING property_unit_id`,
            [propertyId],
        );

        // Whg. 1 — moved in mid-2026: the interesting case for the
        // occupancy-proration fix (only Apr 1 – Dec 31 should count toward
        // a 2026 Vorauszahlung, not the full year).
        const tenancy1 = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, misc_rent, warm_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2026-04-01', 900, 100, 1000, 2700, 'Anna', 'Testmieterin')
             RETURNING tenancy_id`,
            [propertyId, unit1.rows[0].property_unit_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date, tax_id)
             VALUES ($1, 'Anna', 'Testmieterin', true, 0, '2026-04-01', '65100000001')`,
            [tenancy1.rows[0].tenancy_id],
        );

        // Whg. 2 — been there since before 2026: full-year control case,
        // should show a normal (uncapped) Vorauszahlung for comparison.
        const tenancy2 = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, misc_rent, warm_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2023-01-01', 650, 80, 730, 1950, 'Ben', 'Bestandsmieter')
             RETURNING tenancy_id`,
            [propertyId, unit2.rows[0].property_unit_id],
        );
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, move_in_date, tax_id)
             VALUES ($1, 'Ben', 'Bestandsmieter', true, 0, '2023-01-01', '65100000002')`,
            [tenancy2.rows[0].tenancy_id],
        );

        await client.query('COMMIT');

        console.log('Seeded Nebenkostenabrechnung test property:');
        console.log(`  ${STREET}, ${POSTAL_CODE} ${CITY} -> property_id=${propertyId}`);
        console.log(`  Whg. 1 (60 m², property_unit_id=${unit1.rows[0].property_unit_id}): Anna Testmieterin, eingezogen 01.04.2026, 100 €/Monat NK-Vorauszahlung`);
        console.log(`  Whg. 2 (40 m², property_unit_id=${unit2.rows[0].property_unit_id}): Ben Bestandsmieter, seit 01.01.2023, 80 €/Monat NK-Vorauszahlung`);
        console.log('  No settlement/cost items pre-created — opening "Nebenkostenabrechnung" for either unit loads the standard BetrKV template fresh.');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.end();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
