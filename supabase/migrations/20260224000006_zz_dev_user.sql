-- Local development user for the auth-bypass workflow.
-- This is not a real Supabase Auth password; the local compose setup runs
-- Postgres only, so the frontend bypass uses this stable user id directly.

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'dev@immoandthebrain.local',
    '{"full_name": "ImmoAndTheBrain Dev User"}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

INSERT INTO personal_data (
    user_id,
    last_name,
    first_name,
    street,
    house_number,
    city,
    postal_code,
    phone_number,
    email_address,
    tax_identification_number
)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'User',
    'ImmoAndTheBrain Dev',
    'Dev Street',
    '1',
    'Berlin',
    '10115',
    NULL,
    'dev@immoandthebrain.local',
    '00000000000'
)
ON CONFLICT (user_id) DO UPDATE
SET last_name = EXCLUDED.last_name,
    first_name = EXCLUDED.first_name,
    email_address = EXCLUDED.email_address,
    updated_at = NOW();

INSERT INTO password (user_id, password_hash)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    convert_to('dev', 'UTF8')
)
ON CONFLICT (user_id) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    updated_at = NOW();
