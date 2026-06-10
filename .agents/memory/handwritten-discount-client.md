---
name: Handwritten discount client
description: lib/api-client-react/src/discounts.ts was a pre-codegen workaround; it is now superseded.
---

## Rule
`lib/api-client-react/src/discounts.ts` must NOT be re-exported from `index.ts`. It is a handwritten workaround that predates the discount endpoints being added to `openapi.yaml`. Now that codegen generates the same symbols, re-exporting it causes TS2308 duplicate-export errors.

**Why:** The file was written before `/admin/discounts` paths existed in the spec. Once the paths + schemas were added to `openapi.yaml` and codegen ran, `generated/api.ts` exports all the same function/hook names (`useListAdminDiscounts`, `createAdminDiscount`, etc.), creating ambiguity.

**How to apply:**
- Keep the file in place (it documents the original hand-rolled pattern).
- `lib/api-client-react/src/index.ts` should only re-export `./generated/api` and `./generated/api.schemas`.
- CRM code that imported `AdminDiscountItem` (handwritten type) now uses `AdminDiscount` (generated type) from `@workspace/api-client-react`.
