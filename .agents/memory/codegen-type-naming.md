---
name: Codegen type naming
description: How OpenAPI schema names map to generated TypeScript exports; critical for keeping CRM and API code in sync
---

## Rule
Schema name in openapi.yaml → generated TypeScript export name (1:1).

Examples:
- `AdminDiscount` schema → `AdminDiscount` type in api-client-react
- `AdminDiscount` with array fields → generates helper types: `AdminDiscountVehicleModelsItem`, `AdminDiscountPickupLocationsItem`
- `listAdminDiscounts` operationId (array response) → `ListAdminDiscountsResponse` + `ListAdminDiscountsResponseItem`

**Why:** CRM code previously used `AdminDiscountItem` (a handwritten alias) which broke after codegen added the real `AdminDiscount` type. Always import the schema name directly.

**How to apply:** After running codegen, grep api-client-react/src/generated/api.schemas.ts for the actual exported type names before writing CRM code that imports them. Never assume old handwritten aliases survive a codegen run.
