-- Regional price factor for the renovation cost indication (Detailbewertung →
-- Sanierung). Replaces the factors that were hard-coded in
-- apps/web/src/lib/detailCheck/renovation.ts (regionFactorFromPostalCode).
--
-- Lookup is longest-prefix: the full 5-digit postal code is tried first, then
-- its first 4, 3 and 2 digits. The first hit wins; no hit means factor 1.0.
-- That lets a broad 2-digit area carry one value while a city inside it
-- overrides it with a more specific 3- or 4-digit entry (e.g. 14 = Brandenburg,
-- 140/141 = Berlin, 1446–1448 = Potsdam).
--
-- The values are estimates, not taken from a published index. Keeping them in
-- a table means they can be corrected without a code change.

CREATE TABLE IF NOT EXISTS renovation_region_factor (
    plz_prefix    TEXT          PRIMARY KEY CHECK (plz_prefix ~ '^[0-9]{2,5}$'),
    factor        NUMERIC(4, 3) NOT NULL CHECK (factor > 0),
    region_label  TEXT          NOT NULL,
    note          TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE renovation_region_factor IS 'Regionalfaktor für die Preisindikation der Sanierungsmaßnahmen. Suche nach dem längsten passenden PLZ-Präfix (5 → 4 → 3 → 2 Stellen), ohne Treffer gilt 1,0.';
COMMENT ON COLUMN renovation_region_factor.plz_prefix IS 'PLZ-Präfix mit 2 bis 5 Ziffern; ein längerer Präfix überschreibt einen kürzeren.';
COMMENT ON COLUMN renovation_region_factor.factor IS 'Multiplikator auf die Min/Max-Werte der Preistabelle (1,0 = Durchschnitt).';

INSERT INTO renovation_region_factor (plz_prefix, factor, region_label, note) VALUES
    -- Metropolen, 1,12 (unverändert aus dem bisherigen Code übernommen)
    ('10',   1.120, 'Berlin',                         'Aus bisherigem Code übernommen'),
    ('11',   1.120, 'Berlin',                         'Aus bisherigem Code übernommen'),
    ('12',   1.120, 'Berlin',                         'Lücke geschlossen: 12xxx ist Berliner Stadtgebiet'),
    ('13',   1.120, 'Berlin',                         'Lücke geschlossen: 13xxx ist Berliner Stadtgebiet'),
    ('140',  1.120, 'Berlin',                         'Lücke geschlossen: 140xx ist Berliner Stadtgebiet (übriges 14xxx: Brandenburg)'),
    ('141',  1.120, 'Berlin',                         'Lücke geschlossen: 141xx ist Berliner Stadtgebiet (übriges 14xxx: Brandenburg)'),
    ('20',   1.120, 'Hamburg',                        'Aus bisherigem Code übernommen'),
    ('210',  1.120, 'Hamburg',                        'Lücke geschlossen: 210xx ist Hamburger Stadtgebiet (übriges 21xxx: Niedersachsen/Schleswig-Holstein)'),
    ('211',  1.120, 'Hamburg',                        'Lücke geschlossen: 211xx ist Hamburger Stadtgebiet (übriges 21xxx: Niedersachsen/Schleswig-Holstein)'),
    ('22',   1.120, 'Hamburg',                        'Aus bisherigem Code übernommen'),
    ('60',   1.120, 'Frankfurt am Main',              'Aus bisherigem Code übernommen'),
    ('61',   1.120, 'Rhein-Main',                     'Aus bisherigem Code übernommen'),
    ('65',   1.120, 'Wiesbaden / Rhein-Main',         'Aus bisherigem Code übernommen'),
    ('80',   1.120, 'München',                        'Aus bisherigem Code übernommen'),
    ('81',   1.120, 'München',                        'Aus bisherigem Code übernommen'),
    ('82',   1.120, 'München Umland',                 'Aus bisherigem Code übernommen'),
    ('85',   1.120, 'München Umland',                 'Aus bisherigem Code übernommen'),

    -- Großstadtregionen West, 1,06 (unverändert aus dem bisherigen Code übernommen)
    ('40',   1.060, 'Düsseldorf',                     'Aus bisherigem Code übernommen'),
    ('41',   1.060, 'Niederrhein',                    'Aus bisherigem Code übernommen'),
    ('42',   1.060, 'Wuppertal / Bergisches Land',    'Aus bisherigem Code übernommen'),
    ('43',   1.060, 'Ruhrgebiet',                     'Aus bisherigem Code übernommen'),
    ('44',   1.060, 'Ruhrgebiet',                     'Aus bisherigem Code übernommen'),
    ('45',   1.060, 'Ruhrgebiet',                     'Aus bisherigem Code übernommen'),
    ('50',   1.060, 'Köln',                           'Aus bisherigem Code übernommen'),
    ('51',   1.060, 'Köln / Bergisches Land',         'Aus bisherigem Code übernommen'),
    ('70',   1.060, 'Stuttgart',                      'Aus bisherigem Code übernommen'),
    ('71',   1.060, 'Region Stuttgart',               'Aus bisherigem Code übernommen'),
    ('72',   1.060, 'Region Stuttgart / Tübingen',    'Aus bisherigem Code übernommen'),

    -- Ostdeutschland, ländlich/übrig, 0,85 (bisher 1,03 für 01–09, sonst 1,0)
    ('01',   0.850, 'Sachsen (Dresden und Umgebung)', 'Schätzung Ostdeutschland'),
    ('02',   0.850, 'Sachsen (Lausitz)',              'Schätzung Ostdeutschland'),
    ('03',   0.850, 'Brandenburg/Sachsen (Lausitz)',  'Schätzung Ostdeutschland'),
    ('04',   0.850, 'Sachsen (Leipzig und Umgebung)', 'Schätzung Ostdeutschland'),
    ('06',   0.850, 'Sachsen-Anhalt (Halle, Dessau)', 'Schätzung Ostdeutschland'),
    ('07',   0.850, 'Thüringen (Gera, Jena)',         'Schätzung Ostdeutschland'),
    ('08',   0.850, 'Sachsen (Zwickau, Vogtland)',    'Schätzung Ostdeutschland'),
    ('09',   0.850, 'Sachsen (Chemnitz)',             'Schätzung Ostdeutschland'),
    ('14',   0.850, 'Brandenburg (Potsdam-Mittelmark)', 'Schätzung Ostdeutschland'),
    ('15',   0.850, 'Brandenburg (Oder-Spree)',       'Schätzung Ostdeutschland'),
    ('16',   0.850, 'Brandenburg (Oberhavel, Barnim)', 'Schätzung Ostdeutschland'),
    ('17',   0.850, 'Mecklenburg-Vorpommern / Uckermark', 'Schätzung Ostdeutschland'),
    ('18',   0.850, 'Mecklenburg-Vorpommern (Küste)', 'Schätzung Ostdeutschland'),
    ('19',   0.850, 'Mecklenburg-Vorpommern (Schwerin)', 'Schätzung Ostdeutschland'),
    ('39',   0.850, 'Sachsen-Anhalt (Magdeburg, Altmark)', 'Schätzung Ostdeutschland'),
    ('98',   0.850, 'Thüringen (Suhl, Ilmenau)',      'Schätzung Ostdeutschland'),
    ('99',   0.850, 'Thüringen (Erfurt, Weimar)',     'Schätzung Ostdeutschland'),

    -- Ostdeutsche Großstädte, 0,95 (überschreiben den 2-stelligen Bereich)
    ('010',  0.950, 'Dresden',                        'Schätzung Ostdeutschland, Großstadt'),
    ('011',  0.950, 'Dresden',                        'Schätzung Ostdeutschland, Großstadt'),
    ('012',  0.950, 'Dresden',                        'Schätzung Ostdeutschland, Großstadt'),
    ('013',  0.950, 'Dresden',                        'Schätzung Ostdeutschland, Großstadt'),
    ('041',  0.950, 'Leipzig',                        'Schätzung Ostdeutschland, Großstadt'),
    ('042',  0.950, 'Leipzig',                        'Schätzung Ostdeutschland, Großstadt'),
    ('043',  0.950, 'Leipzig',                        'Schätzung Ostdeutschland, Großstadt'),
    ('0774', 0.950, 'Jena',                           'Schätzung Ostdeutschland, Großstadt'),
    ('1446', 0.950, 'Potsdam',                        'Schätzung Ostdeutschland, Großstadt'),
    ('1447', 0.950, 'Potsdam',                        'Schätzung Ostdeutschland, Großstadt'),
    ('1448', 0.950, 'Potsdam',                        'Schätzung Ostdeutschland, Großstadt'),
    ('180',  0.950, 'Rostock',                        'Schätzung Ostdeutschland, Großstadt'),
    ('1810', 0.950, 'Rostock',                        'Schätzung Ostdeutschland, Großstadt'),
    ('1811', 0.950, 'Rostock (Warnemünde)',           'Schätzung Ostdeutschland, Großstadt'),
    ('1814', 0.950, 'Rostock',                        'Schätzung Ostdeutschland, Großstadt'),
    ('9908', 0.950, 'Erfurt',                         'Schätzung Ostdeutschland, Großstadt'),
    ('9909', 0.950, 'Erfurt',                         'Schätzung Ostdeutschland, Großstadt')
ON CONFLICT (plz_prefix) DO UPDATE SET
    factor       = EXCLUDED.factor,
    region_label = EXCLUDED.region_label,
    note         = EXCLUDED.note,
    updated_at   = NOW();

-- Shared reference data: readable by any authenticated user, never writable
-- from the client. Same pattern as city_purchase_price_split and
-- state_acquisition_costs; the server reads it over the same database
-- connection it already uses for those tables.
ALTER TABLE renovation_region_factor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view renovation region factors" ON renovation_region_factor;
CREATE POLICY "Authenticated users can view renovation region factors"
    ON renovation_region_factor FOR SELECT
    USING (auth.role() = 'authenticated');
