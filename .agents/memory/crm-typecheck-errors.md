---
name: Pre-existing CRM typecheck errors
description: Known baseline typecheck errors in CRM that predate Fleet Calendar Phase 1
---

13 errors in 4 files — all pre-existing, none introduced by Fleet Calendar work:

- BookingDetail.tsx:1311 — satisfaction "PROBLEM" type not in generated union (spec drift)
- CustomerProfile.tsx (9 errors) — customerId not in ListAdminBookingsParams; country/passportId/drivingLicense/notes not on AdminCustomer (spec drift)
- FeaturedSlider.tsx:608 — m.brand?.name on brand that may be string (local type issue)
- Rates.tsx:1063,1132 — validFrom string|undefined not assignable to string (form state type)

FleetCalendar.tsx: zero errors.
admin-fleet-calendar.ts: zero errors.
