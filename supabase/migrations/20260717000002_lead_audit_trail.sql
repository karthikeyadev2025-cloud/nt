/*
  # Complete lead audit trail
  Two real gaps fixed:
  1. Reassignments and stage changes happened silently — not part of the timeline
     a new owner sees. Now auto-logged into lead_remarks (same table used for
     calls/visits/notes) so the whole history reads as one continuous timeline.
  2. Remarks only stored user_id, not a durable name/staff-code — if a staff
     member is later renamed or deactivated, historical entries should still
     read correctly. Snapshotting author_name + author_staff_code at write time.
*/

ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS author_staff_code text;

-- Backfill existing rows from current app_users data (best effort).
UPDATE lead_remarks lr SET
  author_name = u.full_name,
  author_staff_code = u.staff_code
FROM app_users u
WHERE lr.user_id = u.id AND lr.author_name IS NULL;

-- Auto-snapshot the author's name/staff_code on every new remark (manual or system-generated).
CREATE OR REPLACE FUNCTION tg_lead_remark_snapshot_author() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.author_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT full_name, staff_code INTO NEW.author_name, NEW.author_staff_code
    FROM app_users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_remark_snapshot_author ON lead_remarks;
CREATE TRIGGER trg_lead_remark_snapshot_author BEFORE INSERT ON lead_remarks
  FOR EACH ROW EXECUTE FUNCTION tg_lead_remark_snapshot_author();

-- Auto-log stage changes and reassignments as timeline entries, so a new owner
-- sees exactly what happened before them without hunting through separate screens.
CREATE OR REPLACE FUNCTION tg_lead_change_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_name text;
  actor_code text;
  from_name text;
  to_name text;
BEGIN
  IF actor_id IS NOT NULL THEN
    SELECT full_name, staff_code INTO actor_name, actor_code FROM app_users WHERE id = actor_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO lead_remarks (lead_id, user_id, call_type, remark, author_name, author_staff_code)
    VALUES (NEW.id, actor_id, 'note', 'Stage changed: ' || OLD.stage || ' → ' || NEW.stage, actor_name, actor_code);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    SELECT full_name INTO from_name FROM app_users WHERE id = OLD.assigned_to;
    SELECT full_name INTO to_name FROM app_users WHERE id = NEW.assigned_to;
    INSERT INTO lead_remarks (lead_id, user_id, call_type, remark, author_name, author_staff_code)
    VALUES (
      NEW.id, actor_id, 'note',
      'Reassigned: ' || COALESCE(from_name, 'Unassigned') || ' → ' || COALESCE(to_name, 'Unassigned'),
      actor_name, actor_code
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_change_log ON marketing_leads;
CREATE TRIGGER trg_lead_change_log AFTER UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION tg_lead_change_log();
