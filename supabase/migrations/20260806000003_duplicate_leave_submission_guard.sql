/*
  # Duplicate leave submission guard (2026-08-06)

  ## The bug
  Nothing stopped an employee from submitting two overlapping leave requests
  for the same dates (seen live: two "sick, 2026-08-06 to 2026-08-06" rows
  for the same staff member, submitted a day apart). A CHECK constraint
  can't do this because it needs to compare against other rows, so this is
  a BEFORE INSERT trigger.

  ## Rule
  Block a new leave request if the same staff member already has a
  'pending' or 'approved' request whose date range overlaps the new one.
  Rejected/cancelled-equivalent ('rejected') requests don't block — an
  employee can resubmit for the same dates after a rejection.
*/

CREATE OR REPLACE FUNCTION trg_prevent_overlapping_leave_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  SELECT id INTO v_conflict_id
  FROM leave_requests
  WHERE staff_user_id = NEW.staff_user_id
    AND status IN ('pending', 'approved')
    AND id IS DISTINCT FROM NEW.id
    AND from_date <= NEW.to_date
    AND to_date >= NEW.from_date
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a % leave request that overlaps these dates.', 
      (SELECT status FROM leave_requests WHERE id = v_conflict_id)
      USING ERRCODE = 'check_violation',
            HINT = 'Cancel or wait for a decision on the existing request before submitting a new one for overlapping dates.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_overlapping_leave_request ON leave_requests;
CREATE TRIGGER trg_guard_overlapping_leave_request
  BEFORE INSERT ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_prevent_overlapping_leave_request();
