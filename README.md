# PadLok API

Admin / operations backend for the PadLok dashboard. This service does **not** power the mobile client app — that's `padlokbackend`'s job. We read from the same PostgreSQL database so admins can manage escrow, disputes, flags, and users that the client backend owns; we write to our own admin-specific tables (admins, roles, permissions, invitations, audit logs).

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

## Scope — what this API does and doesn't

**Does:**
- Authenticates admin/operator accounts (separate from client users)
- Manages roles, custom permissions, and invitations to new admins
- Surfaces BI analytics from the shared DB (platform activity, revenue, disputes, etc.)
- Provides admin tools to resolve disputes, flag users, send broadcasts, etc.
- Owns the admin tables: `admins`, `admin_roles`, `admin_permissions`,
  `role_permissions`, `admin_invitations`, `admin_refresh_tokens`,
  `admin_audit_logs`, plus soon `user_flags`, `risk_alerts`,
  `broadcast_notifications`, `notification_templates`.

**Does NOT:**
- Authenticate mobile-client users (that's `padlokbackend`)
- Create transactions, fund wallets, or move escrow funds on behalf of users
- Mutate client-owned tables (`users`, `wallets`, `transactions`,
  `escrow_transactions`, `disputes`) except via explicit admin actions
  (e.g. resolving a dispute, freezing an account)

## Status

🚧 In active development. Admin/dashboard endpoints shipped first; more analytics + dispute + flag endpoints incoming.
