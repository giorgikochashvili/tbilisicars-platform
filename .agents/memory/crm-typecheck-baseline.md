---
name: CRM typecheck baseline
description: Pre-existing CRM typecheck errors before Fleet Calendar Phase 1; do NOT fix these unless explicitly scoped
---

As of the Fleet Calendar Phase 1 session, `pnpm --filter @workspace/crm exec tsc --noEmit` reports 13 pre-existing errors in 4 files that are OUT OF SCOPE:

- BookingDetail.tsx:1311 (1 error) — "PROBLEM" not in satisfaction enum
- CustomerProfile.tsx:81 (9 errors) — customerId not in ListAdminBookingsParams; country/passportId/drivingLicense/notes not in AdminCustomer
- FeaturedSlider.tsx:608 (1 error) — brand.name on string type
- Rates.tsx:1063,1132 (2 errors) — validFrom: string | undefined not assignable to string

**Why:** These exist before our work started. None of these files were modified by boot-fix or Fleet Calendar Phase 1.

**How to apply:** When running CRM typecheck, subtract these 13 errors from the count to see if we introduced new errors.
