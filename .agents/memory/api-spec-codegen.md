---
name: API Spec / Codegen workflow
description: How to correctly add new endpoints to openapi.yaml so codegen + api-zod work without boot errors
---

## Rule
When adding a new path to `lib/api-spec/openapi.yaml`, you MUST also add every `$ref`-ed component schema to the `components/schemas` section in the same commit, BEFORE running codegen.

**Why:** Orval codegen (`pnpm --filter @workspace/api-spec run codegen`) silently succeeds even with unresolved `$ref`s — it simply omits the missing types. The API server then boot-fails at runtime because `lib/api-zod/src/generated/api.ts` is missing the expected exports (e.g. `GetAdminDashboardWebsiteBookingsResponse`).

**How to apply:**
1. Add the path + operationId to the appropriate section of openapi.yaml.
2. Add all referenced component schemas (request body, response, nested objects) to `components/schemas`.
3. Run `pnpm --filter @workspace/api-spec run codegen`.
4. Run `pnpm --filter @workspace/api-client-react exec tsc -p tsconfig.json` to verify declaration build.
5. Restart the API Server workflow and confirm "Server listening on port 8080" with no errors.
