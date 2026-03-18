# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — cookie-parser, express-session (Postgres-backed), CORS, JSON parsing, error handler
- Routes: `src/routes/index.ts` mounts all sub-routers
- Services: `src/services/<domain>.service.ts` — thin Drizzle ORM wrappers; throw `AppError` subclasses
- Error utilities: `src/lib/errors.ts` — `AppError`, `NotFoundError` (404), `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403)
- Middleware: `src/middlewares/errorHandler.ts` — global error handler; `auth.ts` / `requireAdmin.ts` — session-based auth stubs
- Session: express-session + connect-pg-simple (Postgres store, auto-creates `session` table); session data: `userId?: string`, `isAdmin?: boolean`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)

**Live public endpoints (Step 4B):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/locations` | List active locations |
| GET | `/api/locations/:id` | Get location by ID |
| GET | `/api/fleet/brands` | List brands |
| GET | `/api/fleet/models` | List active vehicle models |
| GET | `/api/fleet/groups` | List active vehicle groups |
| GET | `/api/fleet/vehicles` | List vehicles (filters: status, locationId, vehicleGroupId, vehicleModelId) |
| GET | `/api/fleet/vehicles/:id` | Get vehicle by ID |
| GET | `/api/rates` | List active rates (with tiers) |
| GET | `/api/rates/:id` | Get rate by ID (with tiers) |
| GET | `/api/extras` | List active extras |

**Auth boundaries:**
- Public (no auth): all Step 4B endpoints above
- Customer (`requireAuth`): POST /bookings, GET /bookings/:id, GET /users/me (Step 4C+)
- Admin (`requireAdmin`): /api/crm/* (Step 5+)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models (40 tables, 15 enums, 40 insert schemas)
- `src/schema/<domain>.ts` — domain-split table definitions with `drizzle-zod` insert schemas:
  - `locations.ts` — location, one_way_fees
  - `fleet.ts` — brand, vehicle_model, vehicle_model_photo, vehiclegroup, vehicle, vehiclephoto, document, vehicle_history, vehicleprice
  - `rates.ts` — rate, ratetier, ratedayrange, ratehourrange, ratekmrange
  - `users.ts` — user, admins, tasks, task_assignees
  - `bookings.ts` — extra, booking, bookingextra, booking_history, booking_vehicle_assignments, bookingphoto
  - `promotions.ts` — promo
  - `partners.ts` — partner, partner_document, partner_vehicle
  - `maintenance.ts` — maintenance_service_types, maintenance_services
  - `damages.ts` — damagereport
  - `accounting.ts` — payment
  - `cases.ts` — cases, case_comments, case_attachments, case_assignments, review
  - `settings.ts` — company_settings
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
