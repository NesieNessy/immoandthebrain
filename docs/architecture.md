# ImmoAndTheBrain Architecture

## Overview
ImmoAndTheBrain is a monorepo application for real estate property management and valuation, built with Next.js and Supabase.

## Technology Stack

### Frontend (`apps/web`)
- **Framework**: Next.js (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4 with a custom design system
- **Components**: Shared component library (`apps/web/src/components/ui`)
- **State Management**: React Hooks
- **Icons**: Lucide React
- **Data Access**: Next.js API routes for application data; Supabase JS for Auth and Storage

### Database & Backend Services
- **Primary DB**: PostgreSQL (via Supabase)
- **Auth**: Supabase Auth
- **Features**: Row-Level Security (RLS) policies, RPC functions for multi-step writes
- **Migrations**: SQL-based migrations in `supabase/migrations/`

### Data access

All application tables are accessed through Next.js API routes over a `pg` pool. This includes quick checks, detail checks, properties, units, tenancies, document metadata and personal data. The browser uses Supabase directly only for authentication and private file storage.

Two consequences follow from this design:

- **RLS does not apply.** The pool connects as a regular Postgres role, not as the request's user, so the database cannot scope the query. Every statement must filter `user_id` itself — `requireUserId(request)` validates the bearer token and returns the id, and each query is expected to carry `WHERE user_id = $1`. A forgotten filter is a cross-tenant data leak that no policy will catch.
- **Connection handling matters on serverless.** Each warm Vercel function instance holds its own `pg.Pool`. Pointed at a direct Postgres connection, concurrent traffic multiplies pools until the server's connection limit is reached. `DATABASE_URL` must therefore point at Supabase's transaction pooler (port `6543`), not the direct port `5432`.

### Local development

`NEXT_PUBLIC_AUTH_BYPASS=true` makes the API routes talk to the local Docker Postgres and skips token validation, using a fixed dev user id (`apps/web/src/lib/auth/localBypass.ts`). Hosted deployments validate the Supabase bearer token in every protected API route.

## Architecture Diagram

```
                    ┌──────────────────────────┐
                    │   Browser (React 19)     │
                    └───────┬──────────┬───────┘
                            │          │ Supabase JS
                            │          ▼
                            │   Auth + private Storage
                            ▼
                 ┌───────────────────────┐
                 │  Next.js API routes   │
                 │  requireUserId()      │
                 │  ownership filtering │
                 └───────────┬───────────┘
                             │ node-postgres
                             │ (DATABASE_URL)
                             ▼
                    ┌──────────────────────────┐
                    │   Supabase PostgreSQL    │
                    │   - auth.users           │
                    │   - public.quick_check   │
                    │   - public.property      │
                    │   - detail_check_*       │
                    └──────────────────────────┘
```

## Project Structure

```
immoandthebrain/
├── apps/
│   └── web/               # Next.js frontend
│       ├── src/
│       │   ├── app/       # App Router pages + protected API routes
│       │   ├── components/
│       │   │   ├── ui/        # Shared design-system components
│       │   │   └── features/  # Feature-specific components
│       │   ├── lib/
│       │   │   ├── api/       # Authenticated client API helpers
│       │   │   ├── server/    # DB pool and server authentication
│       │   │   └── supabase/  # Domain clients plus Auth/Storage client
│       │   ├── hooks/
│       │   └── styles/
│       └── public/
│
├── supabase/
│   ├── migrations/       # Database migrations
│   └── config.toml       # Supabase config
│
├── packages/
│   └── types/            # Shared TypeScript types
│
├── docs/
│   ├── architecture.md
│   ├── getting-started.md
│   └── vercel-deployment.md
│
├── docker-compose.yml
└── .github/workflows/
```

## Data Flow

### Authentication
1. User authenticates via Supabase Auth
2. Supabase issues a session/JWT
3. API requests carry the access token as a bearer token
4. `requireUserId()` validates the token and every query filters by the resulting user id

### Property Valuation Flow
1. User initiates a valuation (a quick check, or a full detail check)
2. Frontend validates input with the shared form components
3. Quick-check and detail-check data are written through protected Next.js API routes
4. Results are read back and rendered in the UI

## Security

### Frontend
- Environment variables for Supabase URL/keys
- HTTPS in production
- No secrets embedded client-side beyond the public anon key

### Database (Supabase)
- Row-Level Security policies remain enabled as defense in depth for Supabase access
- API routes connect through `DATABASE_URL` and therefore enforce tenant scoping explicitly in every query
- Encrypted connections
- Automated backups

## Deployment

### Development
```bash
cd apps/web
npm run dev
```

### Production
Deployed on Vercel — see [vercel-deployment.md](vercel-deployment.md).

## Environment Variables

### Web App
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `NEXT_PUBLIC_AUTH_BYPASS`: `true` to use the local Postgres + auth-bypass dev mode instead of hosted Supabase
- `DATABASE_URL`: Postgres connection string used by the API routes (Path B) — **in production this must be Supabase's transaction pooler on port `6543`, not the direct connection on `5432`**
- `SUPABASE_SERVICE_ROLE_KEY`: optional; server-side token validation falls back to the anon key when unset
