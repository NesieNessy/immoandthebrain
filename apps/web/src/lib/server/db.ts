import { Pool, types } from 'pg';

// node-postgres returns NUMERIC/DECIMAL columns as strings by default (to
// avoid silent precision loss for values bigger than a JS number can hold
// exactly) — but every money/area column in this schema is declared NUMERIC,
// and the app-wide TS types on those fields all claim `number`. Left as
// strings, `+` on them silently does string concatenation instead of
// addition (unlike `*`/`/`, which coerce), producing garbage or NaN once
// formatted — parse OID 1700 (numeric) as a real float once, globally, so
// every query through this pool returns actual numbers.
types.setTypeParser(1700, (value: string) => parseFloat(value));

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

const globalForDb = globalThis as typeof globalThis & {
  immonextPgPool?: Pool;
};

export const db =
  globalForDb.immonextPgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.immonextPgPool = db;
}
