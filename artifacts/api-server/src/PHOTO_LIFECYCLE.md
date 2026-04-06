# Photo Lifecycle — Tbilisicars

Handover photos (pickup / return) follow a three-phase lifecycle.
No compression or archival is performed yet — this document records the
intended design so future work slots in cleanly.

## Phases

### Phase 1 — Active (booking ongoing)
- Photos stored at **full resolution** in object storage.
- `bookingphoto.photo_archived_at` is `NULL`.
- No action taken; photos served on demand from the CRM.

### Phase 2 — Post-dropoff optimization candidate (+1 day)
- Triggered by `schedulePhotoLifecycle(bookingId, "DROPOFF")` in
  `admin-bookings.ts`, called after the DROPOFF handover is saved.
- **Currently a stub** (logs `[photo-lifecycle] bookingId=N scheduled`).
- Future: re-encode to ≤ 1 MP / 80 % JPEG, update `bookingphoto.photo_url`.

### Phase 3 — 30-day archive candidate
- 30 days after drop-off, `bookingphoto.photo_archived_at` is set.
- Future: bundle photos into a ZIP, upload to cold GCS path via
  `ObjectStorageService` (`objectStorage.ts`), remove individual objects.

## Schema hook
`lib/db/src/schema/bookings.ts` → `bookingphotoTable.photoArchivedAt`
Added by migration `0003_bookingphoto_archived_at.sql` (nullable timestamp).

## Object storage reference
`artifacts/api-server/src/lib/objectStorage.ts` — `ObjectStorageService`
Signed-URL upload/download in place; archive writes reuse same GCS
credentials via the Replit sidecar endpoint.

## Out of scope (this task)
- Actual image compression / resizing.
- Archive ZIP generation.
- DO Spaces / alternative object storage backends.
- Frontend changes.
