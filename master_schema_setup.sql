/*
  # Master Performance Optimization & RPC Setup Script
  Run this script in your Supabase SQL Editor to enable server-side RPC functions for instant dashboard counts and summary aggregations.
*/

-- Drop old functions first to allow return type signature updates
DROP FUNCTION IF EXISTS get_dashboard_counts(uuid);
DROP FUNCTION IF EXISTS get_segment_summary();
DROP FUNCTION IF EXISTS staff_attendance_summary(text, integer);

-- 1. Dashboard counts RPC
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

-- 2. Segment summary RPC
CREATE OR REPLACE FUNCTION get_segment_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_rec record;
BEGIN
  FOR v_rec IN SELECT slug FROM segments LOOP
    v_result := jsonb_set(
      v_result,
      ARRAY[v_rec.slug],
      jsonb_build_object(
        'tickets', (SELECT count(*) FROM support_tickets WHERE segment_slug = v_rec.slug),
        'openTickets', (SELECT count(*) FROM support_tickets WHERE segment_slug = v_rec.slug AND status IN ('open', 'in_progress')),
        'leads', (SELECT count(*) FROM marketing_leads WHERE segment_slug = v_rec.slug),
        'won', (SELECT count(*) FROM marketing_leads WHERE segment_slug = v_rec.slug AND stage = 'won'),
        'staff', (SELECT count(*) FROM app_users WHERE is_active = true AND v_rec.slug = ANY(segments))
      )
    );
  END LOOP;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_segment_summary() TO authenticated;

-- 3. Staff attendance summary RPC
CREATE OR REPLACE FUNCTION staff_attendance_summary(_segment_slug text DEFAULT NULL, _days integer DEFAULT 7)
RETURNS TABLE (
  staff_user_id uuid,
  full_name text,
  role text,
  days_present bigint,
  days_absent bigint,
  days_on_leave bigint,
  attendance_pct numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_date date := (now() AT TIME ZONE 'Asia/Kolkata')::date - (_days - 1);
BEGIN
  RETURN QUERY
  WITH staff_list AS (
    SELECT u.id, u.full_name, u.role
    FROM app_users u
    WHERE u.is_active = true
      AND u.role != 'super_admin'
      AND (_segment_slug IS NULL OR _segment_slug = ANY(u.segments))
  ),
  records AS (
    SELECT
      a.staff_user_id,
      COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS pres,
      COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS abs,
      COUNT(CASE WHEN a.status = 'on_leave' THEN 1 END) AS lev
    FROM attendance_records a
    WHERE a.attendance_date >= v_start_date
    GROUP BY a.staff_user_id
  )
  SELECT
    sl.id AS staff_user_id,
    sl.full_name,
    sl.role,
    COALESCE(r.pres, 0) AS days_present,
    COALESCE(r.abs, 0) AS days_absent,
    COALESCE(r.lev, 0) AS days_on_leave,
    ROUND(
      (COALESCE(r.pres, 0)::numeric / NULLIF(COALESCE(r.pres, 0) + COALESCE(r.abs, 0) + COALESCE(r.lev, 0), 0)::numeric) * 100,
      1
    ) AS attendance_pct
  FROM staff_list sl
  LEFT JOIN records r ON r.staff_user_id = sl.id
  ORDER BY sl.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION staff_attendance_summary(text, integer) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
