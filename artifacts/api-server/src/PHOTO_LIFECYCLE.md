# Photo Lifecycle — Tbilisicars

Handover photos (pickup / return) follow a three-phase lifecycle.  
No compression or archival is performed yet — this document records the
intended design so future work slots in cleanly.

## Phases

### Phase 1 — Active (booking ongoing)
- Photos are stored at **full resolution** in object storage.
- `bookingphoto.photo_archived_at` is `NULL`.
- No action is taken; photos are served on demand from the CRM.

### Phase 2 — Post-dropoff optimization candidate (+1 day after drop-off)
- Triggered by `schedulePhotoLifecycle(bookingId, "DROPOFF")` in
  `admin-bookings.ts`, called immediately after the DROPOFF handover is saved.
- **Currently a stub** (logs `[photo-lifecycle] bookingId=N scheduled`).
- Future work: enqueue a background job that re-encodes images to ≤ 1 MP /
  80 % JPEG quality and updates `bookingphoto.photo_url` to the new path.

### Phase 3 — 30-day archive candidate
- 30 days after drop-off, photos become candidates for long-term archival.
- `bookingphoto.photo_archived_at` is set to the archival timestamp.
- Future work: bundle per-booking photos into a single ZIP, upload to a cold
  storage path in the existing GCS bucket via `ObjectStorageService`
  (`objectStorage.ts`), then remove the individual objects.

## Schema hook
`lib/db/src/schema/bookings.ts` → `bookingphotoTable.photoArchivedAt`  
Added by migration `0003_bookingphoto_archived_at.sql` (nullable timestamp).

## Object storage reference
`artifacts/api-server/src/lib/objectStorage.ts` — `ObjectStorageService`  
Signed-URL upload/download already in place; archive writes will reuse the
same GCS credentials via the Replit sidecar endpoint.

## Out of scope (this task)
- Actual image compression / resizing.
- Archive ZIP generation.
- DO Spaces / alternative object storage backends.
- Frontend changes.
