# Workspace

## Overview

This pnpm workspace monorepo, built with TypeScript, aims to develop a comprehensive car rental management system. The project includes a public-facing booking website, a CRM for internal management, and a robust API server, all designed to streamline car rental operations.

The business vision is to provide a seamless digital experience for both customers and administrators, enhancing efficiency and customer satisfaction in the car rental market. The system is designed to be scalable, maintaining a clear separation of concerns across its different applications and shared libraries.

## User Preferences

The user prefers a clean, consistent coding style across the monorepo, leveraging TypeScript for strong typing and maintainability. Iterative development is preferred, with a focus on well-defined architectural patterns. The user expects clear and concise communication regarding any proposed changes or architectural decisions.

## Dev Workflow & Routing

**Artifact-Managed Workflows (canonical — used by artifact preview dropdown):**
- `artifacts/website: web` — PORT=19161, BASE_PATH=/ (serves at root `/`)
- `artifacts/crm: web` — PORT=22444, BASE_PATH=/crm/ (serves at `/crm/`)
- `artifacts/api-server: API Server` — PORT=8080 (serves `/api`)

**Named Workflows (run via "Project" button — offset ports to avoid conflicts):**
- `API Server` — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- `CRM` — `PORT=22445 BASE_PATH=/crm/ pnpm --filter @workspace/crm run dev` (offset port — proxy routes /crm/ to 22444)
- `Website` — `PORT=19162 BASE_PATH=/ pnpm --filter @workspace/website run dev` (offset port — proxy routes / to 19161)

**Preview Routing (artifact.toml localPort determines proxy target):**
- `/` → Public booking website (port 19161, artifact workflow)
- `/crm/` → CRM admin panel (port 22444, artifact workflow)
- `/api` → Express API server (port 8080)

**Platform Notes:**
- `.replit` cannot be written to directly (all direct file writes are blocked by the platform); it can only be updated through platform callbacks (e.g. `configureWorkflow`)
- Artifact-managed workflows (`artifacts/crm: web`, `artifacts/website: web`, `artifacts/api-server: API Server`, `artifacts/mockup-sandbox: Component Preview Server`) cannot be removed — platform blocks their deletion. The crm and website artifact workflows now run on their canonical ports (22444, 19161). The named CRM/Website workflows use offset ports (22445, 19162) to avoid conflicts and keep the Project button functional.
- `.replit [[artifacts]]` entries for crm/website cannot be added programmatically (no available callback)

## System Architecture

The monorepo is structured with `artifacts/` for deployable applications and `lib/` for shared libraries. Each package manages its own dependencies within the monorepo.

**Core Technologies:**
- **Monorepo Tool:** pnpm workspaces
- **Node.js:** v24
- **TypeScript:** v5.9
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`) and `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**TypeScript & Composite Projects:**
All packages extend `tsconfig.base.json` with `composite: true`, enabling efficient type checking and dependency resolution across the monorepo. `tsc --build --emitDeclarationOnly` is used for type checking, emitting only `.d.ts` files, while `esbuild` handles JavaScript bundling.

**Applications:**
- **`artifacts/website` (`@workspace/website`)**:
    - **Purpose**: Public-facing car rental booking website.
    - **UI/UX**: Light-mode, professional travel brand design (navy primary, sky blue accent).
    - **Tech Stack**: React, Vite, TanStack Query, Tailwind CSS, shadcn/ui.
    - **Features**: A 5-step multi-step booking form (Trip Details → Choose Car → Add-ons → Contact Info → Review & Submit). Only displays `vehicle_model.available_for_external_systems = true`. Bookings are created with `source="website"`.
    - **Authentication**: None (public access).
- **`artifacts/crm` (`@workspace/crm`)**:
    - **Purpose**: Internal CRM administration application.
    - **UI/UX**: Dark-mode only.
    - **Tech Stack**: React, Vite, wouter for routing, TanStack Query, shadcn/ui.
    - **Features**: Comprehensive modules for Dashboard, Bookings, Fleet, Fleet Calendar, Service, Accounting, Customers, Locations, Extras, Rates, Promotions, and Team, each with CRUD capabilities. Dashboard includes region selectors, KPI cards, fleet status, and timeline views.
    - **Authentication**: Session-based (cookies); redirects to `/crm/login` if unauthenticated.
- **`artifacts/api-server` (`@workspace/api-server`)**:
    - **Purpose**: Express 5 API server.
    - **Design**: Routes are organized in `src/routes/` and leverage `@workspace/api-zod` for validation and `@workspace/db` for persistence. Services (`src/services/`) provide thin Drizzle ORM wrappers. Custom error handling with `AppError` subclasses is implemented.
    - **Authentication**: Uses `express-session` with `connect-pg-simple` for session management. Includes public (no auth), customer (`requireAuth`), and admin (`requireAdmin`) endpoints.
    - **Key Public Endpoints**: `/api/healthz`, `/api/locations`, `/api/fleet/brands`, `/api/fleet/models`, `/api/fleet/groups`, `/api/fleet/vehicles`, `/api/rates`, `/api/extras`.
    - **Public Booking Endpoints**: `/api/public/booking-config`, `/api/public/validate-promo`, `/api/public/quote`, `/api/public/bookings`.
    - **Admin Endpoints**: `/api/admin/*` for full CRUD operations on all entities (fleet, locations, rates, promos, customers, bookings, team, etc.), dashboard summaries, and accounting.

**Shared Libraries:**
- **`lib/db` (`@workspace/db`)**: Drizzle ORM with PostgreSQL. Exports a Drizzle client and a comprehensive schema across 40 tables and 15 enums, with domain-split table definitions and `drizzle-zod` insert schemas.
- **`lib/api-spec` (`@workspace/api-spec`)**: Manages the OpenAPI 3.1 specification (`openapi.yaml`) and Orval configuration (`orval.config.ts`) for generating API clients and schemas.
- **`lib/api-zod` (`@workspace/api-zod`)**: Contains generated Zod schemas from the OpenAPI spec, used for request/response validation in the API server.
- **`lib/api-client-react` (`@workspace/api-client-react`)**: Provides generated React Query hooks and a fetch client from the OpenAPI spec, facilitating data fetching in React applications.
- **`scripts` (`@workspace/scripts`)**: A collection of utility scripts for various workspace tasks.

## External Dependencies

- **PostgreSQL**: Primary database for all application data, including session management via `connect-pg-simple`.
- **Orval**: API codegen tool used to generate TypeScript clients and Zod schemas from an OpenAPI specification.
- **TanStack Query**: Used in both `artifacts/website` and `artifacts/crm` for data fetching, caching, and state management.
- **Tailwind CSS**: Utility-first CSS framework used for styling in `artifacts/website` and `artifacts/crm`.
- **shadcn/ui**: Component library providing accessible and customizable UI components for both front-end applications.
- **Vite**: Build tool for both `artifacts/website` and `artifacts/crm`.
- **wouter**: A tiny React router used in `artifacts/crm`.
- **connect-pg-simple**: PostgreSQL session store for `express-session` in `artifacts/api-server`.