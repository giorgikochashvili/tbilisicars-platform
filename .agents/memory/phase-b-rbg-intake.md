---
name: Phase B — RBG intake transport
description: HOP-B Option C HMAC split, feature classifier, preflight, error boundary, and router factory for the Regional Brands Gateway intake pipeline. All implementation decisions and safety contracts.
---

## Scope
Transport + authentication only. No DB access, no emails, no booking DTO, no production route mount.

## 11-file set
**Modified:**
- `artifacts/api-server/src/lib/internal-hmac.ts` — added `ValidatedHmacMetadata`, `PrevalidateInternalHmacResult`, `prevalidateInternalHmacHeaders` (steps 1–7), `verifyInternalHmacAfterPrevalidation` (steps 9–11); `verifyInternalHmac` refactored as their composition. All 129 Phase A tests still pass.
- `artifacts/api-server/src/test/unit/hmac.test.ts` — Option C seam tests appended (total 222 tests).
- `artifacts/api-server/package.json` — `test:unit` script updated to 7 explicit files.

**New source:**
- `src/lib/intake-feature-classifier.ts` — pure `classifyIntakeFeature`, 5 rules (undefined/empty/false→disabled, true→enabled, else→disabled_with_warning).
- `src/middlewares/internal-rbg-preflight.ts` — `createInternalRbgPreflight()`: path=/,POST,no-query,CT=application/json,CE=identity.
- `src/middlewares/internal-rbg-error-boundary.ts` — `createInternalRbgErrorBoundary()`: entity.too.large→413, encoding.unsupported→415, else→500.
- `src/routes/internal-rbg-router.ts` — `createInternalRbgRouter(deps)` factory.

**New tests:**
- `src/test/unit/intake-feature-classifier.test.ts`
- `src/test/unit/internal-rbg-preflight.test.ts`
- `src/test/unit/internal-rbg-error-boundary.test.ts`
- `src/test/unit/internal-rbg-router-http.test.ts`

## Key implementation decisions

**Why:** These are locked decisions; Phase C must not deviate.

- **Body limit**: 64 kb (`limit: "64kb"`, `inflate: false`). Matches Gateway inbound cap. 512 kb is wrong.
- **Correlation header before express.raw()**: The pre-body middleware (steps 2–3) runs BEFORE `express.raw()` so `x-rbg-request-id` is set on every response, including 413 from the body parser. If you move it after the body parser the 413 loses the header and large bodies on disabled routes return 413 not 404.
- **Feature gate before express.raw()**: Same pre-body middleware fires the 404 before `express.raw()` reads bytes. Large bodies on a disabled route → 404 (correct).
- **Inline UTF-8 and JSON.parse catches**: `TypeError` from `TextDecoder(fatal:true)` and `SyntaxError` from `JSON.parse` are caught inline → 400. They never reach the error boundary. Handler-originated `SyntaxError`/`TypeError` DO reach the boundary → 500.
- **safeLog()**: Wraps all `logger.log()` calls in try-catch that swallows silently. Logger failures must never change HTTP behaviour.
- **Error boundary never calls next(err)**: Calls `next()` only in the `headersSent` guard path, without args.
- **No stub repo in production source**: Tests inject in-test closures for `resolveEnabledClient`.
- **No booking DTO**: After auth, `parsedJson: unknown` only.

## Verification results (final)
- 222 tests, 0 failures.
- Differential typecheck: 11 errors in 4 pre-existing files, 0 new.
- Production CJS build: 2.0 MB, no errors.

## Phase C must-know
- `upsertCustomerByEmail` uses module-level `db` singleton. Phase C needs `resolveCustomerForIntakeTx(tx, params)` instead.
- The router is not mounted anywhere — Phase C wires it at the correct application path.
