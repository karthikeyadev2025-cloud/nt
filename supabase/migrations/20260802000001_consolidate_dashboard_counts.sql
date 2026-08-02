/*
  # Consolidate dashboard badge-count queries into one round trip

  Found by analyzing a real Chrome performance trace: ActionCentre and
  TodayAtAGlance alone fire ~22 separate independent count-only queries in
  parallel on every single dashboard load — each its own full HTTP
  round-trip to Supabase. On a fast connection this is invisible (each
  completes in 200-700ms). On the genuinely slow, lossy mobile connections
  documented throughout this debugging session (1-38 KB/s), 22+ simultaneous
  requests compete hard for very limited bandwidth, and the trace showed
  bursts of 41-53 simultaneous requests firing at once on page load.

  This single RPC returns every count both components need in one response.

  CRITICAL: deliberately NOT SECURITY DEFINER. It must run with the calling
  user's own permissions so Row Level Security keeps scoping every count
  exactly as the original 22 separate queries did — a segment-scoped
  manager must keep seeing only their segment's lead/ticket counts, not
  every segment's. Using DEFINER here would silently leak cross-segment
  data to people who currently can't see it.
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
