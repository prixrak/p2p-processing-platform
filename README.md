# P2P Processing Platform

## Local setup (copy-paste)

**Prerequisites:** Node.js ≥ 20, Docker Desktop (so `docker compose` works).

In your terminal, `cd` to the **repository root** (`p2p`), then run the **whole block** below (paste as one piece):

```bash
set -e
npm install
docker compose up -d

echo "Waiting for PostgreSQL..."
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

test -f .env || cp .env.example .env
grep '^DATABASE_URL=' .env > packages/prisma/.env
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > apps/web/.env.local

npm run db:generate
npm run db:migrate:deploy
npm run db:seed

echo ""
echo "OK: database and seed are ready."
echo "Next, open TWO terminals in this same directory:"
echo "  Terminal 1:  npm run dev:api    → http://localhost:3001"
echo "  Terminal 2:  npm run dev:web    → http://localhost:3000"
echo "Swagger: http://localhost:3001/api"
```

Then run the API in one terminal and the web app in the other (see lines above).

**After `git pull` (new migrations):** `npm run db:migrate:deploy`
**Create a new migration (interactive):** `npm run db:migrate` (requires `packages/prisma/.env` with `DATABASE_URL`, same as in the block above).

---

## Quick Start (step by step)

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

| Service    | Port | Purpose               | UI                                            |
| ---------- | ---- | --------------------- | --------------------------------------------- |
| PostgreSQL | 5432 | Main database         | —                                             |
| Redis      | 6379 | Queues, rate limiting | —                                             |
| MinIO (S3) | 9000 | File storage          | http://localhost:9001 (minioadmin/minioadmin) |

### 3. Setup environment

```bash
test -f .env || cp .env.example .env
grep '^DATABASE_URL=' .env > packages/prisma/.env
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > apps/web/.env.local
```

`packages/prisma/.env` is required for the Prisma CLI (`migrate`, `studio`). The root `.env` is used by NestJS when you run `dev:api`.

#### File storage: MinIO vs real AWS S3

The API stores uploads in S3-compatible storage (`FilesService` → `@aws-sdk/client-s3`). By default, `.env.example` points at **MinIO** from `docker compose` (`S3_ENDPOINT=http://localhost:9000`). Create bucket `p2p-files` in the MinIO console if uploads fail with “NoSuchBucket”.

To use **real AWS S3** on your laptop (same behavior as dev/prod): edit `.env` using the commented template in `.env.example` — disable the MinIO `S3_*` lines, set `S3_BUCKET`, `S3_REGION`, and IAM access keys for a **dev-only** bucket, `S3_FORCE_PATH_STYLE=false`, and **do not** set `S3_ENDPOINT`. The MinIO container can stay idle; Postgres and Redis still need `docker compose`.

### 4. Setup database

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
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

| Role     | Email                | Dashboard URL                    | Notes                              |
| -------- | -------------------- | -------------------------------- | ---------------------------------- |
| Owner    | owner@p2p.local      | http://localhost:3000/owner      |                                    |
| Admin    | admin@p2p.local      | http://localhost:3000/admin      |                                    |
| Support  | support@p2p.local    | http://localhost:3000/support    |                                    |
| Trader   | trader@p2p.local     | http://localhost:3000/trader     | Payout limits: 100–20 000 UAH      |
| Merchant | merchant@p2p.local   | http://localhost:3000/merchant   |                                    |
| Referral | referral@p2p.local   | http://localhost:3000/referral   | 5% commission, trader linked       |

Seed also creates: currencies (UAH, USDT), banks, trader balances, merchant balances, API keys, sample pay-in orders, assigned pay-out orders, and pool (unassigned) pay-out orders.

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

| Module      | Path                    | Description                                                                     |
| ----------- | ----------------------- | ------------------------------------------------------------------------------- |
| auth        | `/api/auth/*`           | JWT login, refresh, 2FA (TOTP)                                                  |
| payin       | `/api/v1/payin/*`       | Merchant Pay-In API (HMAC auth)                                                 |
| payout      | `/api/v1/payout/*`      | Merchant Pay-Out API (HMAC auth); internal pool + assignment endpoints          |
| traders     | `/api/trader/*`         | Trader dashboard + order management; payout pool limits                         |
| merchants   | `/api/merchant/*`       | Merchant dashboard + balances                                                   |
| requisites  | `/api/requisites/*`     | Bank card/wallet CRUD                                                           |
| appeals     | `/api/appeals/*`        | Dispute resolution                                                              |
| settlements | `/api/settlements/*`    | Balance credit/debit                                                            |
| webhooks    | `/api/webhooks/*`       | Webhook logs + manual resend                                                    |
| files       | `/api/files/*`          | S3 upload, presigned URL download                                               |
| telegram    | `/api/telegram/*`       | Bot connection, notification preferences                                        |
| audit       | `/api/audit/*`          | Full audit trail viewer                                                         |
| admin       | `/api/admin/*`          | Admin dashboard stats                                                           |
| support     | `/api/support/*`        | Support dashboard stats                                                         |
| referral    | `/api/referrals/*`      | Referral agent CRUD (admin); `/api/referral/me` cabinet (REFERRAL role)         |
| cascade     | internal                | Smart order distribution (requisite selection)                                  |
| ratings     | `/api/ratings/*`        | Trader/requisite performance scoring                                            |
| health      | `/api/health`           | Health + readiness checks                                                       |
| maintenance | internal                | Cron: auto-cancel expired orders, cleanup logs                                  |

### Pay-Out Pool Logic

All pay-out orders start as **PENDING** with no assigned trader and land in the *shared pool*.

| Actor | Action | Result |
| ----- | ------ | ------ |
| Trader | `GET /api/trader/payout/pool` | See PENDING orders filtered by their min/max limits |
| Trader | `POST /api/trader/payout/orders/:id/take` | Self-assign from pool (PENDING → NEW) |
| Admin/Support | `POST /api/trader/payout/assign` | Assign any PENDING order to a specific trader |
| Admin | `POST /api/traders/:id/payout-limits` | Set the amount range a trader can see in the pool |
| Trader | `POST /api/trader/payout/orders/:id/process` | Move NEW → PROCESSING |
| Trader | `POST /api/trader/payout/orders/:id/complete` | Move PROCESSING → COMPLETED |
| Trader | `POST /api/trader/payout/orders/:id/fail` | Move PROCESSING → FAILED |

### Referral Cabinet

| Feature | Description |
| ------- | ----------- |
| Role `REFERRAL` | New user role for referral agents |
| `GET /api/referral/me` | View own profile + list of referred users |
| `GET /api/referral/me/statistics` | Detailed stats: referred traders' completed order volumes, merchant balances, own earnings |
| `POST /api/referrals` | Admin creates a referral agent |
| `PATCH /api/referrals/:id` | Admin updates commission % |
| `POST /api/referrals/:id/link-user` | Admin links an existing user to a referral agent |
| `DELETE /api/referrals/users/:userId/unlink` | Admin unlinks a user |

---

## Common Commands

```bash
# Development
npm run dev:api              # Start API with ts-node
npm run dev:web              # Start frontend with next dev

# Database
npm run db:migrate:deploy    # Apply existing migrations (after clone / pull)
npm run db:migrate           # prisma migrate dev: create new migrations (interactive)
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

| Variable              | Default                                             | Description                                     |
| --------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`        | `postgresql://postgres:postgres@localhost:5432/p2p` | PostgreSQL connection                           |
| `REDIS_HOST`          | `localhost`                                         | Redis host                                      |
| `JWT_SECRET`          | `dev-jwt-secret-change-me...`                       | **Change in production!**                       |
| `S3_ENDPOINT`         | `http://localhost:9000`                             | MinIO locally, remove for AWS S3                |
| `S3_ACCESS_KEY_ID`    | `minioadmin`                                        | MinIO default / AWS IAM key                     |
| `TELEGRAM_BOT_TOKEN`  | (empty)                                             | Optional; enables trader/specialist notifications |
| `TELEGRAM_WEBHOOK_URL`| (empty)                                             | Production webhook; empty = long polling (dev)    |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | (empty)                         | Web: Connect Bot deep link (`apps/web/.env.local`) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001`                             | API URL for frontend (in `apps/web/.env.local`) |

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
grep '^DATABASE_URL=' .env > packages/prisma/.env   # if Prisma cannot see DATABASE_URL
npm run db:generate
npm run db:migrate:deploy
```

### `Environment variable not found: DATABASE_URL` (migrate / studio)

Create `packages/prisma/.env` with the same `DATABASE_URL` as the root `.env` (see **Local setup** above).

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
docker compose up -d
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
test -f .env || cp .env.example .env
grep '^DATABASE_URL=' .env > packages/prisma/.env
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```
