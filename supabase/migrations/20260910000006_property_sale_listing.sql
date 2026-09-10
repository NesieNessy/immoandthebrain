-- Backs the "Vorbereiten für Verkauf" form. One row per property, created on
-- first Speichern/Veröffentlichen. Carried-over fields are snapshotted from
-- property/tenancy/parking_space at that point rather than referencing them
-- live — editing a listing must never rewrite the tenant-facing property
-- data, and the owner may deliberately diverge the listing from reality
-- (e.g. rounding a price, editing a description for marketing).

CREATE TABLE property_sale_listing (
    property_sale_listing_id  SERIAL                    PRIMARY KEY,
    property_id                 INTEGER                   NOT NULL UNIQUE REFERENCES property(property_id) ON DELETE CASCADE,

    street                        TEXT,
    house_number                  TEXT,
    postal_code                   TEXT,
    city                          TEXT,
    square_meters                 NUMERIC,
    year_of_construction          INTEGER,
    energy_efficient              TEXT,
    floor                        INTEGER,
    number_of_rooms               INTEGER,
    is_rented                    BOOLEAN,
    cold_rent                    NUMERIC,
    service_charges               NUMERIC,
    parking_space_count           INTEGER,

    condition                    TEXT CHECK (condition IN ('Standard', 'Luxus', 'Renovierungsbedürftig')),
    heating_type                  TEXT CHECK (heating_type IN (
        'Gasheizung', 'Ölheizung', 'Fernwärme / Nahwärme', 'Kohleheizung',
        'Wärmepumpe (Luft-Wasser)', 'Wärmepumpe (Sole-Wasser / Erdwärme)', 'Wärmepumpe (Wasser-Wasser / Grundwasser)',
        'Pelletheizung', 'Hackschnitzelheizung', 'Scheitholzheizung / Holzvergaserkessel',
        'Solarthermie (Heizungsunterstützung)', 'Hybridheizung (z. B. Gas + Wärmepumpe)',
        'Elektro-Direktheizung', 'Nachtspeicherheizung', 'Infrarotheizung'
    )),
    parking_space_type            TEXT CHECK (parking_space_type IN ('Garage', 'Duplex-Stellplatz', 'Außen überdacht', 'Außen unüberdacht')),
    sale_price                    NUMERIC,
    parking_space_sale_price      NUMERIC,
    available_from                DATE,
    broker_commission_percent     NUMERIC,
    description                  TEXT,

    status                        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at                   TIMESTAMPTZ,
    selected_portals               TEXT[] NOT NULL DEFAULT '{}',

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE property_sale_listing IS 'One "Vorbereiten für Verkauf" listing snapshot per property, edited/saved independently of the live property record.';

-- No RLS — like property_image, only ever touched through
-- /api/property-sale-listing (pg.Pool, service-role), which enforces
-- ownership itself by joining through property.user_id.

CREATE OR REPLACE FUNCTION update_property_sale_listing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_sale_listing_updated_at
    BEFORE UPDATE ON property_sale_listing
    FOR EACH ROW EXECUTE FUNCTION update_property_sale_listing_updated_at();
