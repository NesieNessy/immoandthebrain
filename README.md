# ImmoAndTheBrain 

Real estate property management and valuation platform built with Next.js and Supabase.

## 🏗️ Architecture

This is a monorepo containing:

- **`apps/web`**: Next.js 15 frontend with App Router
- **`supabase/`**: Database migrations and configuration
- **`packages/types`**: Shared TypeScript types

See [docs/architecture.md](docs/architecture.md) for details.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (optional, only needed for the local Postgres dev mode)
- Supabase CLI (optional, for managing migrations against hosted Supabase)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/NesieNessy/immoandthebrain.git
   cd immoandthebrain
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase project's URL/keys
   ```

3. **Install dependencies**
   ```bash
   npm ci
   ```

4. **Start the app**
   ```bash
   npm run dev
   ```
   App will be available at `http://localhost:3000`.

See [docs/getting-started.md](docs/getting-started.md) for the full walkthrough, including the local-Postgres Docker Compose option.

## 📁 Project Structure

```
immoandthebrain/
├── apps/
│   └── web/           # Next.js frontend
├── supabase/          # Database & migrations
├── packages/
│   └── types/         # Shared TypeScript types
├── docs/              # Documentation
├── .github/           # CI/CD workflows
└── docker-compose.yml # Local Postgres + web (optional dev mode)
```

## 🛠️ Technology Stack

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **Lucide React** - Icons
- **Supabase** - Auth, Postgres database, Row-Level Security

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [Getting Started](docs/getting-started.md)
- [Vercel Deployment](docs/vercel-deployment.md)
- [Performance Monitoring](docs/performance-monitoring.md)

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server (serves the last `npm run build`, no hot reload)
- `npm run lint` - Run ESLint
- `npm run type-check` - Run the TypeScript compiler in check-only mode

## 📦 Deployment

Deployed on Vercel — see [docs/vercel-deployment.md](docs/vercel-deployment.md).

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 👥 Team

- Development Team: NesieNessy

## 📞 Support

For issues and questions, please open an issue on GitHub.
