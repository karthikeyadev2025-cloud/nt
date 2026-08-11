/*
  # Surface pending lead edit/delete requests on the dashboard (2026-08-07)

  Found during an end-to-end audit: every other approval type in this
  system (leaves, advances, regularizations, transfers) shows a count
  on Overview's "Needs Your Attention" panel. Lead edit/delete requests
  (20260807000009_lead_change_approval.sql) never got the same
  treatment — the feature was built with its own approval tab, but
  nothing ever wired its pending count into this dashboard. A Super
  Admin had no way to know a request was waiting unless they happened
  to open CRM/Leads > More > Edit/Delete Approvals and check manually.
*/

CREATE OR REPLACE FUNCTION get_dashboard_counts(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_today_start timestamptz := (v_today)::timestamptz;
  v_soon timestamptz := now() + interval '24 hours';
BEGIN
  PERFORM p_user_id;

  RETURN jsonb_build_object(
    'leaves', (SELECT count(*) FROM leave_requests WHERE status = 'pending'),
    'advances', (SELECT count(*) FROM salary_advance_requests WHERE status = 'pending'),
    'regularizations', (SELECT count(*) FROM attendance_regularizations WHERE status = 'pending'),
    'transfers', (SELECT count(*) FROM marketing_leads WHERE transfer_status = 'pending'),
    'leadChangeRequests', (SELECT count(*) FROM lead_change_requests WHERE status = 'pending'),
    'unassignedLeads', (SELECT count(*) FROM marketing_leads WHERE assigned_to IS NULL AND stage NOT IN ('won', 'lost')),
    'overdueFollowups', (SELECT count(*) FROM marketing_leads WHERE next_followup_at IS NOT NULL AND next_followup_at < now() AND stage NOT IN ('won', 'lost')),
    'overdueCallbacksAppts', (
      SELECT count(*) FROM marketing_leads
      WHERE stage NOT IN ('won', 'lost')
        AND ((callback_at IS NOT NULL AND callback_at < now()) OR (appointment_at IS NOT NULL AND appointment_at < now()))
    ),
    'duplicateLeadGroups', (
      SELECT count(*) FROM (
        SELECT 1 FROM marketing_leads
        WHERE phone IS NOT NULL AND phone <> '' AND phone <> 'Pending Collection'
        GROUP BY segment_slug, phone HAVING count(*) > 1
      ) dup
    ),
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
NOTIFY pgrst, 'reload schema';
