/*
  # Deep lifecycle gap fixes — found by auditing the full employee journey
  from onboarding through daily operations to exit.

  1. Holidays: no holiday calendar existed, so any "absent day" calculation
     counted Sundays and festivals as absences. Payroll would under-pay.
  2. Attendance regularization: if someone forgot to check in/out (phone dead,
     no signal at a site), there was NO way to fix it — the day was permanently
     lost with no correction path. This is a daily-reality problem.
  3. Half-day leave: leave_requests only supported whole days, but the
     attendance status enum already had 'half_day' — inconsistent.
  4. Exit/offboarding: no exit date, reason, or final-settlement tracking.
     Disabling an account was the only "offboarding" available.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Holiday calendar
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  segment_slug text REFERENCES segments(slug) ON DELETE CASCADE,  -- null = company-wide
  is_optional boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(holiday_date, segment_slug)
);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read holidays" ON holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manage holidays" ON holidays FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff'))
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Attendance regularization requests (missed punch correction)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_regularizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regularizations_staff ON attendance_regularizations(staff_user_id, status);
ALTER TABLE attendance_regularizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own regularizations" ON attendance_regularizations FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR (has_permission('view_attendance') AND can_access_staff(staff_user_id)));
CREATE POLICY "request regularization" ON attendance_regularizations FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE POLICY "review regularization" ON attendance_regularizations FOR UPDATE TO authenticated
  USING (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
  WITH CHECK (has_permission('approve_leaves') AND can_access_staff(staff_user_id));

-- On approval, write the corrected times into attendance_records and notify.
CREATE OR REPLACE FUNCTION tg_regularization_resolved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    INSERT INTO attendance_records (staff_user_id, attendance_date, check_in_at, check_out_at, status, work_mode)
    VALUES (NEW.staff_user_id, NEW.attendance_date, NEW.requested_check_in, NEW.requested_check_out, 'present', 'office')
    ON CONFLICT (staff_user_id, attendance_date) DO UPDATE SET
      check_in_at  = COALESCE(EXCLUDED.check_in_at, attendance_records.check_in_at),
      check_out_at = COALESCE(EXCLUDED.check_out_at, attendance_records.check_out_at),
      status = 'present';
    PERFORM notify_user(NEW.staff_user_id, 'regularization', 'Attendance correction approved',
      'Your attendance for ' || NEW.attendance_date || ' has been corrected.', '/portal');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    PERFORM notify_user(NEW.staff_user_id, 'regularization', 'Attendance correction rejected',
      COALESCE(NULLIF(NEW.review_note, ''), 'Your attendance correction request was rejected.'), '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_regularization_resolved ON attendance_regularizations;
CREATE TRIGGER trg_regularization_resolved AFTER UPDATE ON attendance_regularizations
  FOR EACH ROW EXECUTE FUNCTION tg_regularization_resolved();

-- Notify approvers when a regularization is requested.
CREATE OR REPLACE FUNCTION tg_regularization_requested() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE approver record; staff_name text;
BEGIN
  SELECT full_name INTO staff_name FROM app_users WHERE id = NEW.staff_user_id;
  FOR approver IN
    SELECT id FROM app_users
    WHERE is_active AND role IN ('manager','hr','super_admin')
      AND (segments && (SELECT segments FROM app_users WHERE id = NEW.staff_user_id) OR 'all' = ANY(segments) OR role = 'super_admin')
  LOOP
    PERFORM notify_user(approver.id, 'regularization', 'Attendance correction requested',
      COALESCE(staff_name, 'A staff member') || ' requested a correction for ' || NEW.attendance_date, '/portal');
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_regularization_requested ON attendance_regularizations;
CREATE TRIGGER trg_regularization_requested AFTER INSERT ON attendance_regularizations
  FOR EACH ROW EXECUTE FUNCTION tg_regularization_requested();

-- ═══════════════════════════════════════════════════════════════
-- 3. Half-day leave support
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_half_day boolean NOT NULL DEFAULT false;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_period text
  CHECK (half_day_period IS NULL OR half_day_period IN ('first_half','second_half'));

-- ═══════════════════════════════════════════════════════════════
-- 4. Employee exit / offboarding record
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS exit_date date;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS exit_reason text
  CHECK (exit_reason IS NULL OR exit_reason IN ('resigned','terminated','contract_ended','retired','other'));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS exit_note text DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 5. Working-day helper that respects the holiday calendar
--    (previously any absent-day math counted Sundays and festivals)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION count_working_days(_from date, _to date, _segment_slug text DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int
  FROM generate_series(_from, _to, '1 day'::interval) d
  WHERE EXTRACT(DOW FROM d) <> 0  -- exclude Sundays
    AND NOT EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.holiday_date = d::date
        AND h.is_optional = false
        AND (h.segment_slug IS NULL OR h.segment_slug = _segment_slug)
    );
$$;
GRANT EXECUTE ON FUNCTION count_working_days(date, date, text) TO authenticated;
