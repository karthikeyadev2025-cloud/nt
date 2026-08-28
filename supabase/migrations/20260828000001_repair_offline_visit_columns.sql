/*
  # Repair offline-visit columns and reload the PostgREST schema cache
    (2026-08-28)

  Editing 20260727000008 only helps environments built from scratch — it has
  already run everywhere else, so it will never execute again. This migration
  exists to repair the environments that are already deployed.

  Symptom it fixes: field executives log a visit, the app reports it saved on
  the device, and it then sits on "Waiting to sync" forever. Super admins and
  the executives themselves see nothing, because the row never reached
  lead_remarks at all.

  Cause: the offline queue is the only code path that sends client_ref and
  occurred_at. Those columns were added by 20260727000008, which did not
  notify PostgREST afterwards. PostgREST serves its own cached copy of the
  schema, so the columns can exist in the catalog (information_schema will
  happily list them) while PostgREST still rejects any insert referencing
  them with PGRST204. Every other remark path keeps working, because none of
  them mention these two columns — which is what makes the failure look
  selective and confusing.

  Everything below is idempotent and safe to re-run.
*/

ALTER TABLE lead_remarks
  ADD COLUMN IF NOT EXISTS client_ref uuid;

ALTER TABLE lead_remarks
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_remarks_client_ref
  ON lead_remarks (client_ref) WHERE client_ref IS NOT NULL;

-- Rows predating occurred_at sort by created_at, matching the backfill in
-- 20260727000008. Scoped to NULLs so it never rewrites real capture times.
UPDATE lead_remarks SET occurred_at = created_at WHERE occurred_at IS NULL;

COMMENT ON COLUMN lead_remarks.occurred_at IS
  'When the activity actually happened on the ground. Differs from created_at for visits logged offline and synced later.';

-- The point of this migration.
NOTIFY pgrst, 'reload schema';
