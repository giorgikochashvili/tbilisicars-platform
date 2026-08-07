---
name: lib/db composite build requirement
description: lib/db uses composite:true + emitDeclarationOnly. api-server reads compiled .d.ts from lib/db/dist/. New schema files are invisible to tsc until lib/db is rebuilt.
---

## Rule
After adding or changing schema files in `lib/db/src/schema/`, always rebuild `lib/db` before running `tsc --noEmit` on any consumer package:

```bash
cd lib/db && npx tsc --build
```

**Why:** `lib/db/tsconfig.json` has `"composite": true` and `"emitDeclarationOnly": true`. TypeScript project references in `artifacts/api-server` resolve types from `lib/db/dist/*.d.ts`, not from the source. If the dist is stale, new exports appear as "Module has no exported member" errors.

**How to apply:** Any time a task adds to `lib/db/src/schema/index.ts` or adds a new schema file, the build step above must be part of the validation checklist before running downstream `tsc --noEmit`.
