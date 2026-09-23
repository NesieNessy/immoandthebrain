-- Nebenkostenabrechnung settlements were property-wide: every unit of a
-- multi-unit property shared the exact same service_charge_settlement row
-- and its cost items, including each cost item's manually-entered
-- actual_share_override/budget_share_override (Anteil Wohnung) — so editing
-- one unit's Anteil Wohnung silently overwrote what every other unit in the
-- building saw too. A settlement is really per apartment, not per building;
-- this scopes it that way.

ALTER TABLE service_charge_settlement
    ADD COLUMN IF NOT EXISTS property_unit_id INT REFERENCES property_unit(property_unit_id) ON DELETE CASCADE;

-- Backfill: existing rows predate per-unit scoping and were already shared
-- across every unit of their property, so there's no correct unit to assign
-- retroactively — attaching them to the property's first unit (by
-- sort_order) is the least-wrong choice, and only matters for pre-existing
-- multi-unit properties' historical data; a single-unit property's
-- settlement lands on its one unit correctly either way.
UPDATE service_charge_settlement s
SET property_unit_id = (
    SELECT pu.property_unit_id FROM property_unit pu
    WHERE pu.property_id = s.property_id
    ORDER BY pu.sort_order, pu.property_unit_id
    LIMIT 1
)
WHERE property_unit_id IS NULL;

-- A property with a settlement row but literally no property_unit at all
-- shouldn't be possible (the settlement page requires a unit to render),
-- but delete defensively rather than leave an un-backfillable NOT NULL
-- violation blocking this migration.
DELETE FROM service_charge_settlement WHERE property_unit_id IS NULL;

ALTER TABLE service_charge_settlement ALTER COLUMN property_unit_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_charge_settlement_property_unit_id ON service_charge_settlement (property_unit_id);

-- A given unit can only have one settlement per billing period — previously
-- enforced only at the application layer (a "period conflict" check scoped
-- to the whole property), now also a real per-unit DB constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_charge_settlement_unit_period_unique
    ON service_charge_settlement (property_unit_id, period_start, period_end);

COMMENT ON COLUMN service_charge_settlement.property_unit_id IS 'The apartment this settlement is for — settlements are per unit, not shared across a building.';

-- ==============================================================================
-- service_charge_allocation_key — an explicit, persisted Verteilerschlüssel
-- (e.g. a Miteigentumsanteil of 80/1000) for one cost item label on one
-- unit, set once by the landlord and reused as the best-available basis for
-- "Wert vorschlagen" from then on, instead of relying on last period's
-- figures (which may not exist yet, or may themselves have been a rough
-- guess). Keyed by (property_unit_id, label) — not by settlement — since
-- the whole point is a value that's stable across settlement periods; a
-- fresh settlement for a new year doesn't need this re-entered.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS service_charge_allocation_key (
    service_charge_allocation_key_id  SERIAL                      PRIMARY KEY,
    property_unit_id                  INT                         NOT NULL REFERENCES property_unit(property_unit_id) ON DELETE CASCADE,
    -- Denormalized so the generic property-resources dispatcher (which
    -- requires a property_id column on every table it serves) can handle
    -- this table the same way it already does tenancy_adjustment_history
    -- and service_charge_cost_item.
    property_id                       INT                         NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
    -- Matched against service_charge_cost_item.label (case-insensitively at
    -- the application layer) to decide which cost item row this key applies to.
    label                              TEXT                        NOT NULL,
    numerator                          NUMERIC(14, 4)              NOT NULL,
    denominator                        NUMERIC(14, 4)              NOT NULL CHECK (denominator <> 0),
    -- Free-text description of what the key represents (e.g.
    -- "Miteigentumsanteil", "Verbrauch", "Wohnfläche") — shown back to the
    -- landlord so a suggestion can say what it's based on, not just a bare
    -- percentage.
    allocation_type                    TEXT,

    created_at                         TIMESTAMP WITH TIME ZONE   DEFAULT NOW(),
    updated_at                         TIMESTAMP WITH TIME ZONE   DEFAULT NOW(),

    UNIQUE (property_unit_id, label)
);

CREATE INDEX IF NOT EXISTS idx_service_charge_allocation_key_property_unit_id ON service_charge_allocation_key (property_unit_id);
CREATE INDEX IF NOT EXISTS idx_service_charge_allocation_key_property_id ON service_charge_allocation_key (property_id);

COMMENT ON TABLE service_charge_allocation_key IS '1:n with property_unit. An explicit, reusable Verteilerschlüssel for one cost item label on one unit — the best-available basis for a Wert-vorschlagen suggestion.';

ALTER TABLE service_charge_allocation_key ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own service charge allocation keys"
    ON service_charge_allocation_key FOR SELECT
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = service_charge_allocation_key.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can insert own service charge allocation keys"
    ON service_charge_allocation_key FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM property WHERE property.property_id = service_charge_allocation_key.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can update own service charge allocation keys"
    ON service_charge_allocation_key FOR UPDATE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = service_charge_allocation_key.property_id AND property.user_id = auth.uid()));

CREATE POLICY "Users can delete own service charge allocation keys"
    ON service_charge_allocation_key FOR DELETE
    USING (EXISTS (SELECT 1 FROM property WHERE property.property_id = service_charge_allocation_key.property_id AND property.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_service_charge_allocation_key_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_charge_allocation_key_updated_at
    BEFORE UPDATE ON service_charge_allocation_key
    FOR EACH ROW EXECUTE FUNCTION update_service_charge_allocation_key_updated_at();
