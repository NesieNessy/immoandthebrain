# Getting Started with ImmoAndTheBrain

This guide will help you set up the development environment for ImmoAndTheBrain.

## Prerequisites Installation

### 1. Install Node.js 20+
- Download from: https://nodejs.org/
- Verify installation: `node --version`

### 2. Install Docker Desktop (optional, for local Postgres)
- Download from: https://www.docker.com/products/docker-desktop
- Start Docker Desktop
- Verify installation: `docker --version`

## Initial Setup

### 1. Clone and Setup Environment

```bash
# Clone repository
git clone https://github.com/NesieNessy/immoandthebrain.git
cd immoandthebrain

# Copy environment template
cp .env.example .env

# Edit .env file with your settings
# (For local development, default values should work)
```

### 2. Install Dependencies

```bash
npm ci
```

This installs dependencies for `apps/web` and `packages/types` via npm workspaces.

### 3. Start the App

#### Option A: Against hosted Supabase (Recommended)

Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local` to your Supabase project, then:

```bash
npm run dev
```

#### Option B: Local Postgres via Docker Compose

```bash
docker-compose up --build
```

This starts a local Postgres instance and the web app in `NEXT_PUBLIC_AUTH_BYPASS=true` mode, which talks to that local database through the Next.js API routes instead of hosted Supabase.

## Accessing the Application

- **Web App**: http://localhost:3000
- **Supabase Studio** (if using hosted Supabase): your project's dashboard on supabase.com

## Running Database Migrations

### Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link

# Apply migrations
supabase db push
```

### Local Postgres

Migrations in `supabase/migrations/` run automatically when the local Postgres container starts via docker-compose.

## Development Workflow

### 1. Making Changes

```bash
npm run dev  # Hot reload is enabled
```

### 2. Adding Database Migrations

Create a new migration file:
```bash
# supabase/migrations/YYYYMMDD_description.sql
```

Example:
```sql
-- supabase/migrations/20240215_add_user_preferences.sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  preferences JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. Running Checks

```bash
npm run lint
npm run type-check
```

## Common Issues and Solutions

### Issue: Port Already in Use

**Solution:** Stop the service using the port or change the port in configuration.

```bash
# Check what's using port 3000
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Mac/Linux

# Kill the process
taskkill /PID <PID> /F  # Windows
kill -9 <PID>  # Mac/Linux
```

### Issue: `npm start` shows stale content

**Solution:** `npm start` (`next start`) serves a frozen production build from the last `npm run build` — it does not hot-reload. Rebuild after any source change, or use `npm run dev` while actively developing.

### Issue: Database Connection Failed

**Solution:** If using local Postgres, ensure it's running:
```bash
docker-compose up db -d
```

### Issue: Next.js Build Fails

**Solution:** Clear cache and reinstall:
```bash
cd apps/web
rm -rf .next node_modules
cd ../..
rm -rf node_modules package-lock.json
npm install
npm run build
```

## IDE Setup

### VS Code (Recommended)

Install extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript React code snippets

## Next Steps

1. Read the [Architecture Documentation](architecture.md)
2. Explore the codebase
3. Start building features!

## Getting Help

- Check existing issues on GitHub
- Review documentation in `/docs`
- Ask questions in team chat
- Consult Next.js docs: https://nextjs.org/docs
- Consult Supabase docs: https://supabase.com/docs
