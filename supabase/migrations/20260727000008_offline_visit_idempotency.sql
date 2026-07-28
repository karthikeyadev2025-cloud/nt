/*
  # Offline visit sync support (2026-07-27)

  Field executives work at customer sites with unreliable mobile data. Every
  visit save was a direct Supabase call, so a failed request lost the notes,
  photo and GPS outright — the exact data that is hardest to recapture,
  because the executive has already left.

  Visits are now queued locally (IndexedDB) and replayed when connectivity
  returns. Replay needs to be safe against duplicates: a request may have
  actually succeeded on the server before the network dropped on the response,
  in which case the client retries something already stored.

  client_ref is a UUID minted on the device when the visit is logged. The
  unique index makes a replayed insert collide harmlessly instead of creating
  a second copy of the same visit.
*/

ALTER TABLE lead_remarks
  ADD COLUMN IF NOT EXISTS client_ref uuid;

-- Partial unique index: only queued/offline rows carry a client_ref, and
-- existing rows (NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_remarks_client_ref
  ON lead_remarks (client_ref) WHERE client_ref IS NOT NULL;

-- Visits logged offline carry the real time they happened, not the time they
-- eventually synced. Without this a week of queued visits would all appear to
-- have happened the moment the executive found signal.
ALTER TABLE lead_remarks
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

COMMENT ON COLUMN lead_remarks.occurred_at IS
  'When the activity actually happened on the ground. Differs from created_at for visits logged offline and synced later.';

-- Backfill so existing history sorts consistently with new rows.
UPDATE lead_remarks SET occurred_at = created_at WHERE occurred_at IS NULL;
