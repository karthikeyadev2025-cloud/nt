/*
  # Best-practice fix: reassignment and ticket-assignment notifications
  Confirmed gaps: reassigning a lead (via board, bulk reassign, or bulk upload)
  never notified the new owner — they'd only find out by checking their queue.
  Same for tickets. Fixing both with direct notifications, in addition to the
  audit-trail logging already added.
*/

-- Extend the existing lead change-log trigger to also notify the new assignee.
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
    -- Notify the new owner directly (not just the audit log) — this was the actual gap.
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM actor_id THEN
      PERFORM notify_user(NEW.assigned_to, 'lead_assigned', 'New lead assigned to you',
        NEW.customer_name || ' (' || NEW.phone || ') has been assigned to you.', '/portal');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: initial bulk-upload assignment intentionally does NOT fire a per-row
-- notification trigger here — inserting 50-100 leads in one batch would spam
-- the assignee with that many individual notifications. Bulk Upload instead
-- sends a single summary notification from the app after the batch completes.
-- Reassignment (the UPDATE trigger above) still notifies per-lead, since
-- reassignments are smaller, deliberate actions naming a specific customer.

-- Notify a support agent/executive when a ticket is assigned to them.
CREATE OR REPLACE FUNCTION tg_ticket_assign_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(NEW.assigned_to, 'ticket_assigned', 'Ticket assigned to you: ' || NEW.ticket_no,
      NEW.subject, '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_assign_notify ON support_tickets;
CREATE TRIGGER trg_ticket_assign_notify AFTER UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION tg_ticket_assign_notify();

-- ═══════════════════════════════════════════════════════════════
-- Duplicate lead detection (warn, never silently block — the phone might
-- genuinely need a second inquiry). Exposed as a callable RPC the frontend
-- checks before creating/uploading leads.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION find_duplicate_leads(_phone text, _segment_slug text)
RETURNS TABLE (id uuid, customer_name text, stage text, assigned_to uuid, assignee_name text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT l.id, l.customer_name, l.stage, l.assigned_to, u.full_name, l.created_at
  FROM marketing_leads l
  LEFT JOIN app_users u ON u.id = l.assigned_to
  WHERE l.phone = _phone AND l.segment_slug = _segment_slug AND l.stage NOT IN ('won', 'lost')
  ORDER BY l.created_at DESC
  LIMIT 5;
$$;
GRANT EXECUTE ON FUNCTION find_duplicate_leads(text, text) TO authenticated;
