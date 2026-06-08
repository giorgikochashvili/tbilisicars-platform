---
name: Booking attribution Phase 1A
description: Design decisions for the booking_attribution satellite table and attribution capture flow
---

## Satellite table pattern
`booking_attribution` is a 1:0-or-1 satellite of `booking` (UNIQUE on booking_id, ON DELETE CASCADE). All columns nullable. Migration 0013.

## source_brand / source_domain
- **Authoritative** — always derived server-side from `req.hostname` (Express trust proxy 1) via allowlist in `artifacts/api-server/src/lib/attribution.ts`
- Allowlist: tbilisicars.com / www.tbilisicars.com → tbilisicars; kutaisicars.com / www → kutaisicars; batumicars.com / www → batumicars
- source_domain stored canonical without www (tbilisicars.com, not www.tbilisicars.com)
- Unknown/Replit/localhost → source_domain = NULL, source_brand = NULL (booking still succeeds)
- Client-supplied source_brand/domain in JSON body is **ignored**

## Client capture
- `artifacts/website/src/lib/attribution.ts` — `captureAttribution()` / `getAttribution()`
- sessionStorage key: `tc_attribution` (separate from `tc_booking_draft` used by booking draft)
- First-touch semantics: captureAttribution() is a no-op if key already present
- Called once in `main.tsx` before `createRoot`

## Insert safety
- Attribution insert lives inside the existing `setImmediate` callback, **after** email dispatch
- Any error is caught and `console.error`'d only — never re-thrown
- booking.source = "website" is untouched

## What's deferred (Phase 1B+)
- CRM manual booking attribution (source_brand = 'internal')
- CRM UI display of source_brand
- Booking list/detail brand badge
- Reporting / filtering by source_brand
