import { Client } from 'pg';

/**
 * Playwright globalSetup — seeds one property + 2 units + 1 tenancy owned by
 * the auth-bypass user, so the smoke suite has real, known data to click
 * through. Only works against the local Supabase CLI stack: property.user_id
 * -> personal_data.user_id -> auth.users.id is a real FK chain, and the
 * bypass user only exists in auth.users there (seeded by
 * supabase/migrations/20260224_zz_dev_user.sql) — never point this at the
 * shared remote project.
 *
 * Idempotent: deletes any previous run's fixture (matched by the distinctive
 * street name) before inserting, so re-runs against a stack that wasn't
 * freshly reset still leave exactly one copy.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
export const E2E_FIXTURE = {
    street: 'E2E Teststraße',
    houseNumber: '1',
    city: 'Teststadt',
    unit1Label: 'Whg. 1',
    unit2Label: 'Whg. 2',
    tenantFirstName: 'Erika',
    tenantLastName: 'Testperson',
};

export default async function globalSetup() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required to seed e2e fixtures.');

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE street = $1 AND city = $2', [E2E_FIXTURE.street, E2E_FIXTURE.city]);

        const propertyRes = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, federal_state, square_meters, year_of_construction, number_of_units)
             VALUES ($1, $2, $3, $4, '00000', 'Bayern', 200, 2000, 2)
             RETURNING property_id`,
            [BYPASS_USER_ID, E2E_FIXTURE.street, E2E_FIXTURE.houseNumber, E2E_FIXTURE.city],
        );
        const propertyId = propertyRes.rows[0].property_id as number;

        const unit1Res = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, $2, 0, 'WOHNUNG', 60) RETURNING property_unit_id`,
            [propertyId, E2E_FIXTURE.unit1Label],
        );
        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, $2, 1, 'WOHNUNG', 70)`,
            [propertyId, E2E_FIXTURE.unit2Label],
        );

        const tenancyRes = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, tenant_first_name, tenant_last_name, deposit)
             VALUES ($1, $2, true, '2024-01-01', 900, $3, $4, 1800)
             RETURNING tenancy_id`,
            [propertyId, unit1Res.rows[0].property_unit_id, E2E_FIXTURE.tenantFirstName, E2E_FIXTURE.tenantLastName],
        );

        // The UI reads tenant names from tenancy_person (persons list), not
        // tenancy.tenant_first_name/last_name directly — both need seeding.
        // tax_id and move_in_date are required for the Hauptmieter (see
        // tenancy_person_primary_tax_id_required / _move_in_date_required).
        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, tax_id, move_in_date)
             VALUES ($1, $2, $3, true, 0, '12345678901', '2024-01-01')`,
            [tenancyRes.rows[0].tenancy_id, E2E_FIXTURE.tenantFirstName, E2E_FIXTURE.tenantLastName],
        );
    } finally {
        await client.end();
    }
}
