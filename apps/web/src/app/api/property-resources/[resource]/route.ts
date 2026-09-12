import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ResourceConfig = {
  table: string;
  primaryKey: string;
  columns: readonly string[];
  orderBy?: string;
  upsertProperty?: boolean;
};

const RESOURCES: Record<string, ResourceConfig> = {
  'acquisition-costs': {
    table: 'acquisition_costs',
    primaryKey: 'acquisition_costs_id',
    columns: [
      'property_id', 'parking_space_id', 'property_purchase_price', 'price_per_sqm',
      'broker', 'broker_value', 'notary', 'notary_value', 'land_registry',
      'land_registry_value', 'real_estate_tax', 'real_estate_tax_value',
      'adjustment_variable', 'adjustment_variable_value', 'total_ancillary_costs_value',
      'total_ancillary_costs', 'parking_space_purchase_price',
    ],
  },
  'parking-spaces': {
    table: 'parking_space',
    primaryKey: 'parking_space_id',
    columns: ['property_id', 'parking_space_type', 'number_of_parking_spaces'],
    orderBy: 'parking_space_id',
  },
  'property-acquisition': {
    table: 'property_acquisition',
    primaryKey: 'property_acquisition_id',
    columns: ['property_id', 'house_completion_year', 'purchase_date', 'transfer_date'],
    upsertProperty: true,
  },
  'property-units': {
    table: 'property_unit',
    primaryKey: 'property_unit_id',
    columns: [
      'property_id', 'unit_label', 'sort_order', 'usage_type', 'floor', 'location_note',
      'living_area_m2', 'number_of_rooms', 'year_of_construction', 'energy_efficient',
      'number_of_parking_spaces', 'target_cold_rent', 'target_parking_rent',
      'target_ancillary_costs',
    ],
    orderBy: 'sort_order, property_unit_id',
  },
  tenancies: {
    table: 'tenancy',
    primaryKey: 'tenancy_id',
    columns: [
      'maintenance_costs_id', 'parking_space_id', 'property_id', 'property_unit_id',
      'is_rented', 'tenancy_start_date', 'tenancy_end_date', 'tenancy_type',
      'tenancy_units', 'tenancy_units_price', 'parking_space_rent', 'misc_rent',
      'warm_rent', 'cold_rent', 'tenant_first_name', 'tenant_last_name', 'deposit',
      'next_rent_adjustment_date', 'next_rent_adjustment_amount', 'renovation_adjustment_planned',
      'renovation_adjustment_start_date', 'renovation_adjustment_end_date', 'renovation_adjustment_amount',
      'rent_adjustment_reminder_date', 'renovation_adjustment_reminder_date',
      'rent_index_per_m2', 'rent_increase_interval_months', 'planned_renovation_cost',
      'pets_allowed', 'redecoration_clause', 'sublet_allowed', 'additional_terms',
      'acceptance_protocol', 'deposit_paid_out',
    ],
    orderBy: 'tenancy_id',
  },
  'tenancy-adjustment-history': {
    table: 'tenancy_adjustment_history',
    primaryKey: 'history_id',
    columns: ['tenancy_id', 'property_id', 'adjustment_type', 'effective_date', 'amount', 'note'],
    orderBy: 'created_at DESC',
  },
  'property-rnd': {
    table: 'property_rnd',
    primaryKey: 'property_rnd_id',
    columns: [
      'property_id', 'rnd_mode', 'modernization_roof', 'modernization_windows',
      'modernization_lines', 'modernization_heating', 'modernization_facade',
      'modernization_bathrooms', 'modernization_interior',
      'remaining_useful_life_years', 'afa_percent',
    ],
    upsertProperty: true,
  },
  'property-price-split': {
    table: 'property_price_split',
    primaryKey: 'property_price_split_id',
    columns: [
      'property_id', 'split_mode', 'plot_area_m2', 'land_reference_value',
      'co_ownership_numerator', 'co_ownership_denominator',
    ],
    upsertProperty: true,
  },
  'service-charge-settlements': {
    table: 'service_charge_settlement',
    primaryKey: 'service_charge_settlement_id',
    columns: ['property_id', 'period_start', 'period_end', 'source_document_name', 'source_document_path'],
    orderBy: 'period_start DESC',
  },
  'service-charge-cost-items': {
    table: 'service_charge_cost_item',
    primaryKey: 'service_charge_cost_item_id',
    columns: ['service_charge_settlement_id', 'property_id', 'sort_order', 'label', 'allocable', 'actual_amount', 'budget_amount', 'actual_share_override', 'budget_share_override'],
    orderBy: 'sort_order, service_charge_cost_item_id',
  },
  'renovation-measures': {
    table: 'renovation_measure',
    primaryKey: 'renovation_measure_id',
    columns: [
      'property_id', 'sort_order', 'title', 'category', 'description', 'estimated_cost', 'quoted_cost',
      'preferred_start_date', 'quoted_start_date', 'actual_completion_date',
      'published', 'published_at', 'quote_accepted',
      'craftsman_confirmed_completed', 'customer_confirmed_completed', 'craftsman_notes',
    ],
    orderBy: 'sort_order, renovation_measure_id',
  },
  'renovation-measure-quotes': {
    table: 'renovation_measure_quote',
    primaryKey: 'renovation_measure_quote_id',
    columns: ['renovation_measure_id', 'property_id', 'sort_order', 'company_name', 'cost', 'document_path', 'document_file_name', 'accepted'],
    orderBy: 'sort_order, renovation_measure_quote_id',
  },
  'renovation-measure-defects': {
    table: 'renovation_measure_defect',
    primaryKey: 'renovation_measure_defect_id',
    columns: ['renovation_measure_id', 'property_id', 'sort_order', 'description'],
    orderBy: 'sort_order, renovation_measure_defect_id',
  },
  'renovation-measure-photos': {
    table: 'renovation_measure_photo',
    primaryKey: 'renovation_measure_photo_id',
    columns: ['renovation_measure_id', 'property_id', 'storage_path', 'file_name'],
    orderBy: 'renovation_measure_photo_id',
  },
};

const RENOVATION_MEASURE_CHILD_TABLES = ['renovation_measure_quote', 'renovation_measure_defect', 'renovation_measure_photo'];

function getConfig(resource: string): ResourceConfig | null {
  return Object.hasOwn(RESOURCES, resource) ? RESOURCES[resource] : null;
}

function allowedValues(config: ResourceConfig, input: unknown): Record<string, unknown> {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return Object.fromEntries(config.columns.filter((column) => Object.hasOwn(source, column)).map((column) => [column, source[column]]));
}

async function ownsProperty(userId: string, propertyId: unknown): Promise<boolean> {
  const id = Number(propertyId);
  if (!Number.isInteger(id)) return false;
  const result = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [id, userId]);
  return Boolean(result.rowCount);
}

type RouteContext = { params: Promise<{ resource: string }> };

export async function GET(request: Request, context: RouteContext) {
  const userId = await requireUserId(request);
  const config = getConfig((await context.params).resource);
  if (!config) return NextResponse.json({ error: 'Unbekannte Ressource.' }, { status: 404 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const propertyId = url.searchParams.get('propertyId');
  const propertyUnitId = url.searchParams.get('propertyUnitId');
  const tenancyId = url.searchParams.get('tenancyId');
  const settlementId = url.searchParams.get('settlementId');
  const measureId = url.searchParams.get('measureId');
  const filters: string[] = [];
  const values: unknown[] = [userId];
  if (id) {
    values.push(Number(id));
    filters.push(`r.${config.primaryKey} = $${values.length}`);
  }
  if (propertyId) {
    values.push(Number(propertyId));
    filters.push(`r.property_id = $${values.length}`);
  }
  if (propertyUnitId && config.table === 'tenancy') {
    values.push(Number(propertyUnitId));
    filters.push(`r.property_unit_id = $${values.length}`);
  }
  if (tenancyId && config.table === 'tenancy_adjustment_history') {
    values.push(Number(tenancyId));
    filters.push(`r.tenancy_id = $${values.length}`);
  }
  if (settlementId && config.table === 'service_charge_cost_item') {
    values.push(Number(settlementId));
    filters.push(`r.service_charge_settlement_id = $${values.length}`);
  }
  if (measureId && RENOVATION_MEASURE_CHILD_TABLES.includes(config.table)) {
    values.push(Number(measureId));
    filters.push(`r.renovation_measure_id = $${values.length}`);
  }
  // "Current" excludes a tenancy whose move-out date has already passed
  // entirely, rather than merely deprioritizing it — a unit whose only
  // tenancy has moved out must resolve to no current tenancy ("Unvermietet"),
  // not fall back to the stale one. This is also what makes a tenant move-out
  // take effect automatically once its date is reached: nothing has to move
  // the record anywhere, it just stops matching here and the tenancy history page's
  // "not current" query picks it up.
  const isCurrent = url.searchParams.get('current') === 'true';
  if (isCurrent && config.table === 'tenancy') {
    filters.push('(r.tenancy_end_date IS NULL OR r.tenancy_end_date >= CURRENT_DATE)');
  }

  const where = [
    'EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1)',
    ...filters,
  ].join(' AND ');
  // Among the still-active candidates left by the filter above, an
  // open-ended tenancy (no move-out date) always outranks one that merely
  // hasn't ended YET (e.g. the tenancy the reactivate action just displaced,
  // whose end date lands on today) — otherwise a later tenancy_start_date on the
  // displaced row could beat the one actually being reactivated.
  const orderBy = isCurrent && config.table === 'tenancy'
    ? ' ORDER BY (tenancy_end_date IS NULL) DESC, tenancy_start_date DESC NULLS LAST LIMIT 1'
    : isCurrent && config.table === 'service_charge_settlement'
      ? ' ORDER BY period_end DESC LIMIT 1'
      : config.orderBy ? ` ORDER BY ${config.orderBy}` : '';
  const sql = `SELECT r.* FROM ${config.table} r WHERE ${where}${orderBy}`;
  const shouldLogTiming = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DB_TIMING === '1';
  const start = Date.now();
  const { rows } = await db.query(sql, values);
  if (shouldLogTiming) {
    console.log(`property-resources: query ${config.table} executed in ${Date.now() - start}ms (${values.length} params)`);
  }

  if (id || url.searchParams.get('single') === 'true') {
    if (!rows[0]) return NextResponse.json({ error: 'Datensatz nicht gefunden.' }, { status: 404 });
    return NextResponse.json(rows[0]);
  }
  return NextResponse.json(rows);
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await requireUserId(request);
  const config = getConfig((await context.params).resource);
  if (!config) return NextResponse.json({ error: 'Unbekannte Ressource.' }, { status: 404 });
  const input = await request.json();
  const valuesByColumn = allowedValues(config, input.values);

  if (!await ownsProperty(userId, valuesByColumn.property_id)) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }
  const columns = Object.keys(valuesByColumn);
  if (columns.length === 0) return NextResponse.json({ error: 'Keine Daten übermittelt.' }, { status: 400 });

  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const upsert = input.upsert === true && config.upsertProperty
    ? ` ON CONFLICT (property_id) DO UPDATE SET ${columns.filter((column) => column !== 'property_id').map((column) => `${column} = EXCLUDED.${column}`).join(', ')}, updated_at = NOW()`
    : '';
  const { rows } = await db.query(
    `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})${upsert} RETURNING *`,
    columns.map((column) => valuesByColumn[column]),
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await requireUserId(request);
  const config = getConfig((await context.params).resource);
  if (!config) return NextResponse.json({ error: 'Unbekannte Ressource.' }, { status: 404 });
  const input = await request.json();
  const id = Number(input.id);
  const valuesByColumn = allowedValues(config, input.values);
  delete valuesByColumn.property_id;
  const columns = Object.keys(valuesByColumn);
  if (!Number.isInteger(id) || columns.length === 0) {
    return NextResponse.json({ error: 'Ungültige Änderung.' }, { status: 400 });
  }
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`);
  assignments.push('updated_at = NOW()');
  const { rows } = await db.query(
    `UPDATE ${config.table} r SET ${assignments.join(', ')} WHERE r.${config.primaryKey} = $1 AND EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $2) RETURNING r.*`,
    [id, userId, ...columns.map((column) => valuesByColumn[column])],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Datensatz nicht gefunden.' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: Request, context: RouteContext) {
  const userId = await requireUserId(request);
  const config = getConfig((await context.params).resource);
  if (!config) return NextResponse.json({ error: 'Unbekannte Ressource.' }, { status: 404 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const propertyId = url.searchParams.get('propertyId');
  if (!id && !propertyId) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });
  const targetColumn = id ? config.primaryKey : 'property_id';
  const targetValue = Number(id ?? propertyId);
  const result = await db.query(
    `DELETE FROM ${config.table} r WHERE r.${targetColumn} = $1 AND EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $2)`,
    [targetValue, userId],
  );
  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}
