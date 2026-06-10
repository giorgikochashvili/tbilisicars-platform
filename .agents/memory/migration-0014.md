---
name: Migration 0014 dev verification
description: Status and constraints for 0014_vehicle_model_brand_visibility.sql
---

Applied to dev DB (heliumdb) on 2026-06-10. All 12 post-checks passed.
Idempotency confirmed (second run → INSERT 0).

Backfill result: 6 tbilisicars rows (all 6 vehicle_model rows had available_for_external_systems=true).
kutaisicars=0, batumicars=0.

**Production gate:** apply only after Phase 3B-2 (service read+write), Phase 3B-4 (public booking-config),
and Phase 3B-6 (CRM Fleet UI) are all merged and staged together as a single coordinated release.

Apply command: psql "$DATABASE_URL" -f lib/db/migrations/0014_vehicle_model_brand_visibility.sql
Do NOT use drizzle-kit push for this.
