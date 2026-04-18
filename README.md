# PadLok API

Unified backend for the PadLok platform — serves the admin dashboard and (in a later iteration) the client mobile app.

## Stack

- **Express.js 4** + **TypeScript 5**
- **PostgreSQL** (shared with `padlokbackend`)
- **Redis** (caching, rate limits, pub/sub)
- **BullMQ** (async jobs — notification broadcasts)
- **Socket.io** (real-time dashboard updates)
- **JWT** (admin authentication with refresh tokens)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your values
cp .env.example .env

# 3. Run migrations (creates admin tables in the shared DB)
npm run migrate

# 4. Seed permissions + create the first Super Admin
npm run migrate:seed

# 5. Start the dev server (hot reload)
npm run dev
```

Server listens on `http://localhost:4000` by default. Health check at `GET /api/v1/health`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run with nodemon + ts-node |
| `npm run build` | Compile TS → `dist/` |
| `npm start` | Run compiled JS |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run migrate:down` | Roll back the last migration |
| `npm run migrate:seed` | Seed permissions + bootstrap super admin |

## Architecture

Feature-per-folder. Each feature owns its routes, controller, service, and validators.

```
src/
├── app.ts                 # Express app
├── server.ts              # Cluster + graceful shutdown
├── config/                # DB, Redis, queue, env
├── models/                # Pure SQL data layer
├── features/              # auth, admin, role, analytics, dispute, flag, notification
├── middleware/            # auth, requirePermission, errorHandler, security
├── infrastructure/        # email, socket, push wrappers
├── utils/                 # AppError, respond, logger, jwt
└── database/              # Migration runner + SQL files
```

## API prefix

All routes are prefixed with `/api/v1` (configurable via `API_PREFIX`).

## Authentication

- Admins receive email invitations with signed tokens (7-day expiry).
- They accept the invite by setting a password — issued a JWT access token (1 day) + refresh token (30 days).
- Subsequent requests must include `Authorization: Bearer <jwt>`.
- Each endpoint that mutates state requires a specific permission key, enforced by `requirePermission('key')` middleware.

## Status

🚧 In active development. Admin/dashboard endpoints first; client mobile endpoints later.
