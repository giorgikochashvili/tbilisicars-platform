---
name: DB package project references
description: lib/db uses TypeScript composite project references; schema source changes require rebuilding dist/ before consuming packages see them
---

The `lib/db` package has `"composite": true` in its tsconfig and compiles to `lib/db/dist/` (declarations only, `emitDeclarationOnly: true`). The `artifacts/api-server` tsconfig has a `"references"` entry pointing to `../../lib/db`.

**Rule:** After adding new exports to `lib/db/src/schema/*.ts`, run `cd lib/db && pnpm exec tsc --build` before running the api-server typecheck. Without this, tsc reads the stale `dist/*.d.ts` and reports "has no exported member" for anything newly added.

**Why:** TypeScript project references resolve types from compiled declaration files (`dist/`), not from `.ts` source directly, even though the package.json `exports` field points to `.ts` files. The `exports` field is used at runtime/bundler resolution; project references use `outDir`.

**How to apply:** Any time a new table, schema, or type is appended to `lib/db/src/schema/`, always rebuild db declarations before typechecking api-server or other consumers.
