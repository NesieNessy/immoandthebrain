-- ==============================================================================
-- ImmoAndTheBrain – Row-Level Security for the Detailbewertung tables
--
-- Every detail_check_* table was created without RLS. Supabase grants anon and
-- authenticated access to tables in `public` by default, so a table with RLS
-- switched off is readable and writable by any caller holding the anon key —
-- which ships in the client bundle. The app only ever reaches these tables
-- through the server-side API routes, but the REST endpoint is open regardless.
--
-- The same applies to three shared reference tables. `city_purchase_price_split`
-- is the odd one out: 20260325 added a SELECT policy for it, but RLS was never
-- enabled, so that policy has been inert ever since.
--
-- Deliberately NOT using FORCE ROW LEVEL SECURITY: the `pg` pool in
-- lib/server/db.ts connects as the table owner, and Postgres exempts the owner
-- from RLS. That is what keeps the existing API routes working while the app
-- migrates to the Supabase client. Once lib/server/db.ts is gone, add FORCE so
-- an owner-level connection cannot sidestep these policies either.
--
-- Idempotent: safe to re-run.
-- ==============================================================================

-- ── Per-user tables ───────────────────────────────────────────────────────────
-- All eleven share the same shape: a NOT NULL `user_id UUID` identifying the
-- owning user. The loop makes that uniformity the point — every table gets the
-- identical four policies, with no room for one to drift.

DO $$
DECLARE
    target_table TEXT;
    per_user_tables CONSTANT TEXT[] := ARRAY[
        'detail_check_property_data',
        'detail_check_acquisition_costs',
        'detail_check_financing',
        'detail_check_depreciation',
        'detail_check_renovation',
        'detail_check_rental',
        'detail_check_comparison',
        'detail_check_location_score',
        'detail_check_recommendation',
        'detail_check_rent_calculator',
        'detail_check_rent_increases'
    ];
BEGIN
    FOREACH target_table IN ARRAY per_user_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = target_table
        ) THEN
            RAISE EXCEPTION 'Expected table public.% to exist', target_table;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

        EXECUTE format('DROP POLICY IF EXISTS "Users can view own %s" ON public.%I', target_table, target_table);
        EXECUTE format(
            'CREATE POLICY "Users can view own %s" ON public.%I FOR SELECT USING (auth.uid() = user_id)',
            target_table, target_table
        );

        EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %s" ON public.%I', target_table, target_table);
        EXECUTE format(
            'CREATE POLICY "Users can insert own %s" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)',
            target_table, target_table
        );

        -- USING filters which rows may be updated, WITH CHECK stops an update
        -- from reassigning a row to a different user_id.
        EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON public.%I', target_table, target_table);
        EXECUTE format(
            'CREATE POLICY "Users can update own %s" ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
            target_table, target_table
        );

        EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON public.%I', target_table, target_table);
        EXECUTE format(
            'CREATE POLICY "Users can delete own %s" ON public.%I FOR DELETE USING (auth.uid() = user_id)',
            target_table, target_table
        );
    END LOOP;
END
$$;

-- ── Shared reference tables ───────────────────────────────────────────────────
-- No user_id — the same rows apply to everyone. Readable by any authenticated
-- user, never writable from the client. Follows the kpf_ranges /
-- legal_requirements precedent.

ALTER TABLE state_acquisition_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view state acquisition costs" ON state_acquisition_costs;
CREATE POLICY "Authenticated users can view state acquisition costs"
    ON state_acquisition_costs FOR SELECT
    USING (auth.role() = 'authenticated');

ALTER TABLE comparison_reference_properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view comparison reference properties" ON comparison_reference_properties;
CREATE POLICY "Authenticated users can view comparison reference properties"
    ON comparison_reference_properties FOR SELECT
    USING (auth.role() = 'authenticated');

-- The SELECT policy from 20260325 already exists; enabling RLS is what finally
-- puts it into effect and closes off writes.
ALTER TABLE city_purchase_price_split ENABLE ROW LEVEL SECURITY;

-- ── Verification ──────────────────────────────────────────────────────────────
-- Fail the migration rather than leave a table half-secured.

DO $$
DECLARE
    unsecured TEXT;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unsecured
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (
          c.relname LIKE 'detail_check_%'
          OR c.relname IN ('state_acquisition_costs', 'comparison_reference_properties', 'city_purchase_price_split')
      )
      AND (
          c.relrowsecurity IS FALSE
          OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
      );

    IF unsecured IS NOT NULL THEN
        RAISE EXCEPTION 'RLS incomplete on: %', unsecured;
    END IF;
END
$$;
