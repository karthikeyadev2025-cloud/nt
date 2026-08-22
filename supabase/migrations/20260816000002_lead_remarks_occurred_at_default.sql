/*
  # Fix: newly added lead remarks sink to the bottom of the discussion

  The bug
  -------
  Migration 20260727000008 added lead_remarks.occurred_at ("when the activity
  actually happened on the ground", so a week of offline-queued visits doesn't
  all appear at the moment they synced). It backfilled existing rows with
  created_at — but it gave the column **no DEFAULT**, and the only writer that
  ever sets it is the offline visit queue (src/lib/offlineQueue.ts).

  Every remark typed normally — every call outcome, every discussion note,
  every stage-change log — is therefore inserted with occurred_at = NULL.

  Both history views order by:

      occurred_at DESC NULLS LAST, created_at DESC

  so every NULL row sorts BELOW every backfilled row. A note typed today
  lands underneath notes from months ago, at the very bottom of the list.
  Staff type a remark, look at the top of the discussion where it should be,
  don't see it, and reasonably conclude it wasn't saved. It was saved
  correctly the whole time — it was just filed at the bottom.

  This gets worse over time, not better: every remark added after
  20260727000008 is NULL, so the "invisible" block grows while the correctly
  sorted block stays frozen at its backfill date.

  The fix
  -------
  1. DEFAULT now() so every future remark carries a real timestamp. The
     offline queue still passes its own captured value explicitly, and an
     explicit value always beats the default — the offline behaviour that
     motivated the column is unaffected.
  2. Backfill the NULLs written since the column was added.
  3. NOT NULL so this cannot silently regress: any future insert path that
     forgets occurred_at now fails loudly instead of quietly mis-sorting.
  4. Index the sort key, since it is the ordering for every remark timeline.
*/

ALTER TABLE lead_remarks ALTER COLUMN occurred_at SET DEFAULT now();

-- Everything written between 20260727000008 and this migration.
UPDATE lead_remarks SET occurred_at = created_at WHERE occurred_at IS NULL;

-- created_at is itself nullable in the schema, so guard the residue before
-- adding the constraint — otherwise this migration fails on any row that
-- somehow has neither timestamp.
UPDATE lead_remarks SET occurred_at = now() WHERE occurred_at IS NULL;

ALTER TABLE lead_remarks ALTER COLUMN occurred_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_remarks_lead_occurred
  ON lead_remarks (lead_id, occurred_at DESC);
