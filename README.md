# P2P Processing Platform

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **Docker** (for PostgreSQL, Redis, MinIO)

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts 3 services:

| Service      | Port  | Purpose              | UI                          |
|-------------|-------|----------------------|-----------------------------|
| PostgreSQL  | 5432  | Main database        | —                           |
| Redis       | 6379  | Queues, rate limiting| —                           |
| MinIO (S3)  | 9000  | File storage         | http://localhost:9001 (minioadmin/minioadmin) |

### 3. Setup environment

```bash
cp .env.example .env
```

Default values work out of the box with Docker services above.

### 4. Setup database

```bash
npm run db:generate        # Generate Prisma Client
npm run db:migrate         # Run migrations
npm run db:seed            # Seed test data
```

### 5. Run the apps

In two separate terminals:

```bash
npm run dev:api            # Backend  → http://localhost:3001
npm run dev:web            # Frontend → http://localhost:3000
```

API Swagger docs: http://localhost:3001/api

---

## Test Accounts

All accounts use password: `admin123`

| Role     | Email               | Dashboard URL                |
|----------|---------------------|------------------------------|
| Owner    | owner@p2p.local     | http://localhost:3000/owner   |
| Admin    | admin@p2p.local     | http://localhost:3000/admin   |
| Support  | support@p2p.local   | http://localhost:3000/support |
| Trader   | trader@p2p.local    | http://localhost:3000/trader  |
| Merchant | merchant@p2p.local  | http://localhost:3000/merchant|

Seed also creates: currencies (UAH, USDT), banks, trader balances, merchant balances, API keys, and sample orders.

---

## Project Structure

```
p2p/
├── apps/
│   ├── api/                    # NestJS backend (port 3001)
│   │   └── src/
│   │       ├── common/         # Guards, interceptors, decorators, filters
│   │       ├── config/         # Prisma module/service
│   │       ├── modules/        # Feature modules (see below)
│   │       └── workers/        # BullMQ processors (webhook, telegram)
│   └── web/                    # Next.js frontend (port 3000)
│       └── src/
│           ├── app/            # Pages (trader/, admin/, merchant/, owner/, support/, pay/)
│           ├── components/ui/  # Reusable UI components
│           └── lib/            # API client, auth, helpers
├── packages/
│   ├── shared/                 # Enums, types, state machines, constants
│   ├── prisma/                 # Database schema, migrations, seed
│   └── config/                 # Centralized env configuration
├── docker-compose.yml          # Local dev infrastructure
├── Dockerfile.api              # Production API image
├── Dockerfile.web              # Production frontend image
└── .github/workflows/ci.yml   # CI/CD pipeline
```

### Backend Modules

| Module        | Path                    | Description                                      |
|--------------|-------------------------|--------------------------------------------------|
| auth         | `/api/auth/*`           | JWT login/register, 2FA (TOTP)                   |
| payin        | `/api/v1/payin/*`       | Merchant Pay-In API (HMAC auth)                  |
| payout       | `/api/v1/payout/*`      | Merchant Pay-Out API (HMAC auth)                 |
| traders      | `/api/trader/*`         | Trader dashboard + order management              |
| merchants    | `/api/merchant/*`       | Merchant dashboard + balances                    |
| requisites   | `/api/requisites/*`     | Bank card/wallet CRUD                            |
| appeals      | `/api/appeals/*`        | Dispute resolution                               |
| settlements  | `/api/settlements/*`    | Balance credit/debit                             |
| webhooks     | `/api/webhooks/*`       | Webhook logs + manual resend                     |
| files        | `/api/files/*`          | S3 upload, presigned URL download                |
| telegram     | `/api/telegram/*`       | Bot connection, notification preferences         |
| audit        | `/api/audit/*`          | Full audit trail viewer                          |
| admin        | `/api/admin/*`          | Admin dashboard stats                            |
| support      | `/api/support/*`        | Support dashboard stats                          |
| cascade      | internal                | Smart order distribution (requisite selection)    |
| ratings      | `/api/ratings/*`        | Trader/requisite performance scoring             |
| health       | `/api/health`           | Health + readiness checks                        |
| maintenance  | internal                | Cron: auto-cancel expired orders, cleanup logs   |

---

## Common Commands

```bash
# Development
npm run dev:api              # Start API with ts-node
npm run dev:web              # Start frontend with next dev

# Database
npm run db:migrate           # Create/apply migrations
npm run db:generate          # Regenerate Prisma Client after schema change
npm run db:seed              # Seed/re-seed test data (idempotent)
npm run db:studio            # Open Prisma Studio (DB browser) → http://localhost:5555

# Quality
npm run lint                 # ESLint across all workspaces
npm run typecheck            # TypeScript check across all workspaces
npm run test                 # Jest tests across all workspaces

# Build
npm run build:api            # Compile API to dist/
npm run build:web            # Build Next.js for production

# Docker (production images)
docker build -f Dockerfile.api -t p2p-api .
docker build -f Dockerfile.web -t p2p-web .
```

---

## Environment Variables

All variables are in `.env.example`. Key ones:

| Variable              | Default                          | Description                        |
|----------------------|----------------------------------|------------------------------------|
| `DATABASE_URL`       | `postgresql://postgres:postgres@localhost:5432/p2p` | PostgreSQL connection       |
| `REDIS_HOST`         | `localhost`                      | Redis host                         |
| `JWT_SECRET`         | `dev-jwt-secret-change-me...`    | **Change in production!**          |
| `S3_ENDPOINT`        | `http://localhost:9000`          | MinIO locally, remove for AWS S3   |
| `S3_ACCESS_KEY_ID`   | `minioadmin`                     | MinIO default / AWS IAM key        |
| `TELEGRAM_BOT_TOKEN` | (empty)                          | Optional, for notifications        |
| `NEXT_PUBLIC_API_URL`| `http://localhost:3001`          | API URL for frontend (in `apps/web/.env.local`) |

---

## Architecture Overview

```
                    ┌──────────────┐
  Merchant API ────▶│              │──── PostgreSQL (data)
  (HMAC-SHA512)     │   NestJS     │──── Redis (queues + rate limits)
                    │   API        │──── S3/MinIO (files)
  Dashboard UI ────▶│  :3001       │
  (JWT auth)        │              │──── BullMQ Workers
                    └──────────────┘     ├── webhook (delivery + retry)
                           ▲             └── telegram (notifications)
                           │
                    ┌──────────────┐
                    │   Next.js    │
  Browser ─────────▶│   Web        │
                    │  :3000       │
                    └──────────────┘
```

**Two types of API auth:**

- **Merchants** (programmatic): HMAC-SHA512 signed requests (`X-API-Key`, `X-API-Signature`, `X-API-Payload`)
- **Dashboard users** (browser): JWT Bearer tokens (access 15min + refresh 7d)

---

## Troubleshooting

### `docker compose up -d` fails
Make sure Docker Desktop is running. On older Docker versions, try `docker-compose up -d` (with hyphen).

### API won't start — Prisma errors
```bash
npm run db:generate          # Regenerate client
npm run db:migrate           # Apply pending migrations
```

### Frontend shows "Network Error" on login
Check that `apps/web/.env.local` contains:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Port already in use
```bash
lsof -i :3001                # Find what's using the port
kill -9 <PID>                # Kill it
```

### Reset everything
```bash
docker compose down -v       # Remove containers + volumes (deletes all data!)
docker compose up -d         # Fresh start
npm run db:migrate
npm run db:seed
```
