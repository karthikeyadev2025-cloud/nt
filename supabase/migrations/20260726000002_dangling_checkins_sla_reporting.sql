/*
  # Remaining lifecycle/ops gaps

  1. Dangling check-ins: someone checks in, forgets to check out, and the record
     sits open forever — hours worked reads as 0, payroll auto-fill undercounts,
     and they can't check in the next day cleanly. Adds an explicit flag + a
     callable cleanup so HR can close stale days (rather than a silent cron
     guessing times, which would fake attendance data).

  2. Ticket SLA: no concept of a ticket being overdue. An urgent CCTV outage
     and a low-priority query looked identical in the queue after a week.
     Adds per-priority response targets + a derived overdue view.

  3. reports_to was added last migration but nothing used it — wiring it into
     leave/regularization notifications so a direct manager is always told,
     not just anyone holding the permission.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Dangling check-in handling
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

-- Lists open check-ins from previous days so HR can resolve them explicitly.
CREATE OR REPLACE FUNCTION list_dangling_checkins()
RETURNS TABLE (
  id uuid, staff_user_id uuid, full_name text, attendance_date date,
  check_in_at timestamptz, days_open int
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ar.id, ar.staff_user_id, u.full_name, ar.attendance_date, ar.check_in_at,
         (CURRENT_DATE - ar.attendance_date)::int
  FROM attendance_records ar
  JOIN app_users u ON u.id = ar.staff_user_id
  WHERE ar.check_in_at IS NOT NULL
    AND ar.check_out_at IS NULL
    AND ar.attendance_date < CURRENT_DATE
    AND (is_super_admin() OR (has_permission('view_attendance') AND can_access_staff(ar.staff_user_id)))
  ORDER BY ar.attendance_date;
$$;
GRANT EXECUTE ON FUNCTION list_dangling_checkins() TO authenticated;

-- Closes a dangling day at the staff member's shift end time (or a supplied
-- time), flagged as auto_closed so it's never mistaken for a real punch.
CREATE OR REPLACE FUNCTION close_dangling_checkin(_record_id uuid, _check_out timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec record;
  shift_end time;
  resolved_out timestamptz;
BEGIN
  SELECT * INTO rec FROM attendance_records WHERE id = _record_id;
  IF rec IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT (is_super_admin() OR (has_permission('manage_payroll') OR has_permission('approve_leaves'))
          AND can_access_staff(rec.staff_user_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _check_out IS NOT NULL THEN
    resolved_out := _check_out;
  ELSE
    SELECT s.end_time INTO shift_end
    FROM staff_shifts ss JOIN shifts s ON s.id = ss.shift_id
    WHERE ss.staff_user_id = rec.staff_user_id AND ss.effective_to IS NULL
    LIMIT 1;
    resolved_out := (rec.attendance_date + COALESCE(shift_end, '18:30'::time))::timestamptz;
  END IF;

  UPDATE attendance_records
  SET check_out_at = resolved_out, auto_closed = true
  WHERE id = _record_id;

  PERFORM notify_user(rec.staff_user_id, 'attendance',
    'Attendance day closed',
    'Your ' || rec.attendance_date || ' check-out was missing and has been closed by HR. Request a correction if the time is wrong.',
    '/portal');
END;
$$;
GRANT EXECUTE ON FUNCTION close_dangling_checkin(uuid, timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. Ticket SLA targets
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ticket_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority text NOT NULL UNIQUE CHECK (priority IN ('low','medium','high','urgent')),
  response_hours int NOT NULL,
  resolution_hours int NOT NULL
);
ALTER TABLE ticket_sla_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read sla" ON ticket_sla_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage sla" ON ticket_sla_policies FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO ticket_sla_policies (priority, response_hours, resolution_hours) VALUES
  ('urgent', 2, 8), ('high', 4, 24), ('medium', 12, 72), ('low', 24, 168)
ON CONFLICT (priority) DO NOTHING;

-- Derived: which open tickets have blown their resolution target.
CREATE OR REPLACE FUNCTION list_overdue_tickets(_segment_slug text DEFAULT NULL)
RETURNS TABLE (
  id uuid, ticket_no text, subject text, segment_slug text, priority text,
  status text, customer_name text, created_at timestamptz, hours_open numeric, target_hours int
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT t.id, t.ticket_no, t.subject, t.segment_slug, t.priority, t.status, t.customer_name,
         t.created_at,
         ROUND(EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600, 1),
         p.resolution_hours
  FROM support_tickets t
  JOIN ticket_sla_policies p ON p.priority = t.priority
  WHERE t.status IN ('open','in_progress','waiting_customer')
    AND EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600 > p.resolution_hours
    AND (_segment_slug IS NULL OR t.segment_slug = _segment_slug)
    AND has_permission('view_tickets') AND can_access_segment(t.segment_slug)
  ORDER BY (EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600) - p.resolution_hours DESC;
$$;
GRANT EXECUTE ON FUNCTION list_overdue_tickets(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Use reports_to: notify the direct manager first on leave requests
--    (previously notified nobody directly — only visible if they looked)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tg_leave_requested_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  staff_name text;
  mgr_id uuid;
  approver record;
BEGIN
  SELECT full_name, reports_to INTO staff_name, mgr_id FROM app_users WHERE id = NEW.staff_user_id;

  IF mgr_id IS NOT NULL THEN
    PERFORM notify_user(mgr_id, 'leave', 'Leave request from ' || COALESCE(staff_name, 'your team'),
      NEW.from_date || ' to ' || NEW.to_date || ' — ' || NEW.leave_type, '/portal');
  ELSE
    FOR approver IN
      SELECT id FROM app_users
      WHERE is_active AND role IN ('manager','hr','super_admin')
        AND (segments && (SELECT segments FROM app_users WHERE id = NEW.staff_user_id)
             OR 'all' = ANY(segments) OR role = 'super_admin')
    LOOP
      PERFORM notify_user(approver.id, 'leave', 'Leave request from ' || COALESCE(staff_name, 'a staff member'),
        NEW.from_date || ' to ' || NEW.to_date || ' — ' || NEW.leave_type, '/portal');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leave_requested_notify ON leave_requests;
CREATE TRIGGER trg_leave_requested_notify AFTER INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION tg_leave_requested_notify();
