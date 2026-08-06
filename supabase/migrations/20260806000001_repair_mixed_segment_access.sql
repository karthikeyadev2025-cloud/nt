/*
  # Segment access data repair (2026-08-06)

  Root cause fixed in the frontend: the "ALL SEGMENTS" toggle in Super
  Admin → Access Control was a plain multi-select button alongside
  individual segments, not mutually exclusive. An admin could end up with
  segments = ['digital_media', 'all'] without realizing 'all' silently
  grants full access regardless of what else is in the array (see
  canAccessSegment() in AuthContext.tsx).

  This migration repairs any row already in that broken state. Since
  'all' was already overriding everything at read time, the *effective*
  access these users had is unchanged — this just makes the stored data
  match what was actually happening, so the Access Control UI displays
  correctly (showing "ALL SEGMENTS" selected, not a confusing mix).

  If you want to audit who was affected: this migration logs the impacted
  user IDs, full names, and their segments array *before* the cleanup into
  a temp result set (visible in the migration output / Supabase logs).
*/

BEGIN;

-- Log affected rows before changing them, for review purposes.
DO $$
DECLARE
  v_row record;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT id, full_name, role, segments
    FROM app_users
    WHERE segments @> ARRAY['all']::text[]
      AND array_length(segments, 1) > 1
  LOOP
    RAISE NOTICE 'Repairing segments for % (%, role=%): % -> [all]',
      v_row.full_name, v_row.id, v_row.role, v_row.segments;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Total staff records repaired: %', v_count;
END $$;

-- The actual repair: collapse ['x', 'all'] (any order, any extras) to ['all'].
UPDATE app_users
SET segments = ARRAY['all']::text[]
WHERE segments @> ARRAY['all']::text[]
  AND array_length(segments, 1) > 1;

COMMIT;
