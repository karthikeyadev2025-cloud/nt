/*
  # Add overdueTickets to get_dashboard_counts

  Found via a full audit that a concurrent session had reverted ActionCentre
  back to 8 separate hand-written queries — including one referencing a
  table that doesn't exist (`employee_tasks` instead of `office_tasks`) and
  one referencing a column that doesn't exist (`support_tickets.is_overdue`).
  Since that code used `Promise.all()` with no error handling, any single
  failing query — guaranteed here, since the table itself doesn't exist —
  would reject the whole batch and leave the dashboard's loading state
  stuck permanently true. This was very likely a real, significant
  contributor to today's "dashboard never finishes loading" reports.

  This migration adds the one genuinely new field that reverted code needed
  (overdueTickets) using the same correct SLA-policy-based logic already
  used by list_overdue_tickets, rather than a fabricated column.
*/

CREATE OR REPLACE FUNCTION get_dashboard_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_start timestamptz := (v_today)::timestamptz;
  v_soon timestamptz := now() + interval '24 hours';
BEGIN
  RETURN jsonb_build_object(
    'leaves', (SELECT count(*) FROM leave_requests WHERE status = 'pending'),
    'advances', (SELECT count(*) FROM salary_advance_requests WHERE status = 'pending'),
    'regularizations', (SELECT count(*) FROM attendance_regularizations WHERE status = 'pending'),
    'transfers', (SELECT count(*) FROM marketing_leads WHERE transfer_status = 'pending'),
    'unassignedLeads', (SELECT count(*) FROM marketing_leads WHERE assigned_to IS NULL AND stage NOT IN ('won', 'lost')),
    'overdueFollowups', (SELECT count(*) FROM marketing_leads WHERE next_followup_at IS NOT NULL AND next_followup_at < now() AND stage NOT IN ('won', 'lost')),
    'apptsSoon', (SELECT count(*) FROM marketing_leads WHERE appointment_at IS NOT NULL AND appointment_at >= now() AND appointment_at <= v_soon AND stage NOT IN ('won', 'lost')),
    'myTasks', (SELECT count(*) FROM office_tasks WHERE assigned_to = p_user_id AND status IN ('pending', 'in_progress')),
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

NOTIFY pgrst, 'reload schema';
