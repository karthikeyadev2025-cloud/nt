/*
  # Audit P0 security fixes (2026-08-03)

  Two real leaks found in end-to-end review, both low-blast-radius but easy to
  eliminate completely — worth doing before more surface area is added.

  ─────────────────────────────────────────────────────────────────
  1. get_dashboard_counts() trusted a client-supplied user id
  ─────────────────────────────────────────────────────────────────
  The signature `get_dashboard_counts(p_user_id uuid)` accepts the caller's
  own id as a plain parameter and uses it directly in the `myTasks` sub-
  query:

      'myTasks', (SELECT count(*) FROM office_tasks
                  WHERE assigned_to = p_user_id ...)

  Any authenticated staff member can therefore pass a colleague's uuid
  (their id is exposed anywhere a lead assignee or ticket assignee is
  shown) and read back that colleague's pending-task count. Trivial info
  leak, but it doesn't need to exist.

  Fix: ignore the parameter entirely and read auth.uid() directly. The
  parameter is kept in the signature so the existing frontend call keeps
  working with no coordinated release — it's just no longer trusted.

  ─────────────────────────────────────────────────────────────────
  2. lead_remarks INSERT policy never checked lead visibility
  ─────────────────────────────────────────────────────────────────
  The original init migration created:

      CREATE POLICY "staff add remarks" ON lead_remarks FOR INSERT
        TO authenticated
        WITH CHECK (has_permission('manage_leads'));

  Later migrations tightened the SELECT policy (author-only + segment gate)
  but this INSERT policy was never revisited. A telecaller in one segment
  who somehow learns a lead uuid in a different segment can inject a
  remark on it — write-only cross-segment escalation. Chances of exploit
  are low (uuids aren't enumerable and the SELECT policy still blocks
  reading it back), but there's no reason to permit it.

  Fix: mirror the SELECT policy on INSERT. To write a remark you must
  already be able to READ the underlying lead — via ownership, creator,
  full_leads_view + segment access, or by being an assignable member of
  the pool for that segment.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. get_dashboard_counts — use auth.uid(), ignore parameter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dashboard_counts(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();  -- source of truth, ignore any passed value
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_start timestamptz := (v_today)::timestamptz;
  v_soon timestamptz := now() + interval '24 hours';
BEGIN
  -- p_user_id is intentionally unused. Kept in the signature so the old
  -- frontend call `.rpc('get_dashboard_counts', { p_user_id: user?.id })`
  -- still resolves; the new default lets callers drop it entirely once
  -- the frontend is updated.
  PERFORM p_user_id;

  RETURN jsonb_build_object(
    'leaves', (SELECT count(*) FROM leave_requests WHERE status = 'pending'),
    'advances', (SELECT count(*) FROM salary_advance_requests WHERE status = 'pending'),
    'regularizations', (SELECT count(*) FROM attendance_regularizations WHERE status = 'pending'),
    'transfers', (SELECT count(*) FROM marketing_leads WHERE transfer_status = 'pending'),
    'unassignedLeads', (SELECT count(*) FROM marketing_leads WHERE assigned_to IS NULL AND stage NOT IN ('won', 'lost')),
    'overdueFollowups', (SELECT count(*) FROM marketing_leads WHERE next_followup_at IS NOT NULL AND next_followup_at < now() AND stage NOT IN ('won', 'lost')),
    'apptsSoon', (SELECT count(*) FROM marketing_leads WHERE appointment_at IS NOT NULL AND appointment_at >= now() AND appointment_at <= v_soon AND stage NOT IN ('won', 'lost')),
    'myTasks', (SELECT count(*) FROM office_tasks WHERE assigned_to = v_uid AND status IN ('pending', 'in_progress')),
    'overdueTasks', (SELECT count(*) FROM office_tasks WHERE status IN ('pending', 'in_progress') AND due_date < v_today),
    'openTickets', (SELECT count(*) FROM support_tickets WHERE status IN ('open', 'in_progress')),
    'unassignedTickets', (SELECT count(*) FROM support_tickets WHERE assigned_to IS NULL AND status IN ('open', 'in_progress')),
    'overdueTickets', (
      SELECT count(*) FROM support_tickets t
      JOIN ticket_sla_policies p ON p.priority = t.priority
      WHERE t.status IN ('open', 'in_progress', 'waiting_customer')
        AND EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600 > p.resolution_hours
    ),
    'notCheckedIn', (
      SELECT count(*) FROM app_users s
      WHERE s.is_active = true AND s.role != 'super_admin'
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records a
          WHERE a.staff_user_id = s.id AND a.attendance_date = v_today
        )
    ),
    'checkedInToday', (SELECT count(*) FROM attendance_records WHERE attendance_date = v_today AND check_in_at IS NOT NULL),
    'newLeadsToday', (SELECT count(*) FROM marketing_leads WHERE created_at >= v_today_start),
    'bankChangeReq', (SELECT count(*) FROM bank_change_requests WHERE status = 'pending'),
    'photoChangeReq', (SELECT count(*) FROM photo_change_requests WHERE status = 'pending')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_counts(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. lead_remarks INSERT — mirror the SELECT policy's lead-visibility check
-- ═══════════════════════════════════════════════════════════════
-- Existing SELECT policy (from 20260725000002):
--   USING (EXISTS lead is: assigned to me / created by me
--                    / (full_leads_view AND same segment)
--                    / (unassigned in-flight AND same segment) )
-- INSERT now requires the same visibility.

DROP POLICY IF EXISTS "staff add remarks" ON lead_remarks;
CREATE POLICY "staff add remarks" ON lead_remarks FOR INSERT TO authenticated
  WITH CHECK (
    has_permission('manage_leads')
    AND EXISTS (
      SELECT 1 FROM marketing_leads l
      WHERE l.id = lead_id
        AND (
          l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
          OR (has_permission('full_leads_view') AND can_access_segment(l.segment_slug))
          OR (l.assigned_to IS NULL AND l.stage NOT IN ('won','lost') AND can_access_segment(l.segment_slug))
        )
    )
  );

NOTIFY pgrst, 'reload schema';
