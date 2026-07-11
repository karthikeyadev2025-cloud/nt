/*
  # Ported directly from Punchly (smart-timekeeper): shifts + late-fine rules,
  # payslips + salary_payments (real payment tracking, not just structure),
  # attendance insight RPCs. Adapted: no tenant_id/branch_id (single company),
  # staff_user_id/app_users naming to match Nikki's schema, segment_slug used
  # instead of branch_id where a scope dimension is useful.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Shifts + per-staff assignment + late-fine deduction rules
--    (ported from Punchly's staff_panel_upgrade + original shifts table)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE CASCADE,  -- null = company-wide shift
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes int DEFAULT 60,
  working_days int[] DEFAULT ARRAY[1,2,3,4,5],  -- 1=Mon..7=Sun
  grace_minutes int NOT NULL DEFAULT 10,
  late_fine_type text NOT NULL DEFAULT 'none'
    CHECK (late_fine_type IN ('none','fixed_per_occurrence','per_minute','half_day_after_minutes')),
  late_fine_amount numeric(10,2) NOT NULL DEFAULT 0,
  half_day_after_minutes int NOT NULL DEFAULT 120,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read shifts" ON shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage shifts" ON shifts FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff')) WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shift assignment" ON staff_shifts FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('view_staff') OR is_super_admin());
CREATE POLICY "admin assign shifts" ON staff_shifts FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff')) WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

-- Late detection: is_late flag + minutes_late, computed at check-in against the staff's active shift.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS minutes_late int NOT NULL DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. Payslips + salary_payments (real payment tracking — ported from Punchly)
--    Distinct from salary_structure (what's owed monthly): this tracks what
--    was actually generated and paid, per period, with partial-payment support.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  base_salary numeric(12,2) NOT NULL DEFAULT 0,
  present_days numeric(5,2) NOT NULL DEFAULT 0,
  absent_days numeric(5,2) NOT NULL DEFAULT 0,
  paid_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  unpaid_leave_days numeric(5,2) NOT NULL DEFAULT 0,
  working_days numeric(5,2) NOT NULL DEFAULT 0,
  late_days int NOT NULL DEFAULT 0,
  late_fine numeric(10,2) NOT NULL DEFAULT 0,
  performance_bonus numeric(12,2) NOT NULL DEFAULT 0,
  incentives numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  last_paid_at timestamptz,
  generated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_user_id, period_year, period_month)
);
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payslips" ON payslips FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('view_payroll') OR is_super_admin());
CREATE POLICY "hr manage payslips" ON payslips FOR ALL TO authenticated
  USING (has_permission('manage_payroll') OR is_super_admin()) WITH CHECK (has_permission('manage_payroll') OR is_super_admin());

CREATE TABLE IF NOT EXISTS salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id uuid NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('cash','bank_transfer','upi','cheque','other')),
  reference text DEFAULT '',
  note text DEFAULT '',
  paid_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_payslip ON salary_payments(payslip_id);
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own salary payments" ON salary_payments FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('view_payroll') OR is_super_admin());
CREATE POLICY "hr record payments" ON salary_payments FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_payroll') OR is_super_admin());
CREATE POLICY "hr delete payments" ON salary_payments FOR DELETE TO authenticated
  USING (has_permission('manage_payroll') OR is_super_admin());

-- Trigger: keep payslips.payment_status/amount_paid/last_paid_at in sync
-- with the sum of salary_payments rows (ported verbatim from Punchly).
CREATE OR REPLACE FUNCTION recompute_payslip_payment_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payslip_id uuid;
  v_total numeric(12,2);
  v_net numeric(12,2);
  v_last_paid timestamptz;
BEGIN
  v_payslip_id := COALESCE(NEW.payslip_id, OLD.payslip_id);

  SELECT COALESCE(SUM(amount), 0), MAX(paid_at) INTO v_total, v_last_paid
  FROM salary_payments WHERE payslip_id = v_payslip_id;

  SELECT net_pay INTO v_net FROM payslips WHERE id = v_payslip_id;

  UPDATE payslips SET
    amount_paid = v_total,
    last_paid_at = v_last_paid,
    payment_status = CASE
      WHEN v_total <= 0 THEN 'unpaid'
      WHEN v_total >= v_net THEN 'paid'
      ELSE 'partial'
    END
  WHERE id = v_payslip_id;

  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_salary_payments_recompute_ins ON salary_payments;
CREATE TRIGGER trg_salary_payments_recompute_ins AFTER INSERT ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION recompute_payslip_payment_status();
DROP TRIGGER IF EXISTS trg_salary_payments_recompute_del ON salary_payments;
CREATE TRIGGER trg_salary_payments_recompute_del AFTER DELETE ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION recompute_payslip_payment_status();

CREATE OR REPLACE FUNCTION tg_payslip_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.payment_status <> NEW.payment_status AND NEW.payment_status IN ('partial','paid') THEN
    v_title := CASE WHEN NEW.payment_status = 'paid' THEN 'Salary paid' ELSE 'Partial salary paid' END;
    PERFORM notify_user(NEW.staff_user_id, 'payslip', v_title,
      'Your ' || NEW.period_month || '/' || NEW.period_year || ' payslip is now ' || NEW.payment_status || '.', '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_payslip_notify ON payslips;
CREATE TRIGGER trg_payslip_notify AFTER UPDATE ON payslips FOR EACH ROW EXECUTE FUNCTION tg_payslip_notify();

-- ═══════════════════════════════════════════════════════════════
-- 3. Attendance insight RPCs (ported + adapted from Punchly's
--    staff_attendance_summary / daily_attendance_trend — single-company,
--    excludes super_admin from staff counts, same as Punchly excludes tenant owners)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staff_attendance_summary(_segment_slug text DEFAULT NULL, _days int DEFAULT 7)
RETURNS TABLE (
  staff_user_id uuid, full_name text, staff_code text, phone text, designation text,
  days_window int, days_present int, days_absent int, days_on_leave int,
  last_checkin_date date, attendance_pct numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date date := CURRENT_DATE - (_days - 1);
  v_end_date date := CURRENT_DATE;
BEGIN
  IF NOT (is_super_admin() OR has_permission('view_reports') OR has_permission('view_attendance')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH staff AS (
    SELECT u.id AS sid, u.full_name AS sname, u.staff_code AS scode, u.phone AS sphone, u.designation AS sdesig
    FROM app_users u
    WHERE u.is_active = true
      AND u.role <> 'super_admin'
      AND (_segment_slug IS NULL OR _segment_slug = ANY(u.segments) OR 'all' = ANY(u.segments))
  ),
  attendance AS (
    SELECT ar.staff_user_id AS uid, COUNT(DISTINCT ar.attendance_date)::int AS days, MAX(ar.attendance_date) AS last_date
    FROM attendance_records ar
    WHERE ar.attendance_date BETWEEN v_start_date AND v_end_date AND ar.check_in_at IS NOT NULL
    GROUP BY ar.staff_user_id
  ),
  leaves AS (
    SELECT lr.staff_user_id AS uid,
      SUM((LEAST(lr.to_date, v_end_date) - GREATEST(lr.from_date, v_start_date))::int + 1)::int AS days
    FROM leave_requests lr
    WHERE lr.status = 'approved' AND lr.from_date <= v_end_date AND lr.to_date >= v_start_date
    GROUP BY lr.staff_user_id
  )
  SELECT s.sid, s.sname, s.scode, s.sphone, s.sdesig, _days,
    COALESCE(a.days, 0)::int,
    GREATEST(_days - COALESCE(a.days, 0) - COALESCE(l.days, 0), 0)::int,
    LEAST(COALESCE(l.days, 0), _days)::int,
    a.last_date,
    ROUND((COALESCE(a.days, 0)::numeric / NULLIF(_days, 0)) * 100, 0)
  FROM staff s
  LEFT JOIN attendance a ON a.uid = s.sid
  LEFT JOIN leaves l ON l.uid = s.sid
  ORDER BY COALESCE(a.days, 0) ASC, s.sname;
END;
$$;
GRANT EXECUTE ON FUNCTION staff_attendance_summary(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION daily_attendance_trend(_segment_slug text DEFAULT NULL, _days int DEFAULT 14)
RETURNS TABLE (attendance_date date, present_count int, absent_count int, total_staff int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR has_permission('view_reports') OR has_permission('view_attendance')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(CURRENT_DATE - (_days - 1), CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  staff_ids AS (
    SELECT u.id FROM app_users u
    WHERE u.is_active = true AND u.role <> 'super_admin'
      AND (_segment_slug IS NULL OR _segment_slug = ANY(u.segments) OR 'all' = ANY(u.segments))
  ),
  total AS (SELECT COUNT(*)::int AS t FROM staff_ids),
  per_day AS (
    SELECT ar.attendance_date AS d, COUNT(DISTINCT ar.staff_user_id)::int AS present
    FROM attendance_records ar
    WHERE ar.check_in_at IS NOT NULL AND ar.attendance_date >= CURRENT_DATE - (_days - 1)
      AND ar.staff_user_id IN (SELECT id FROM staff_ids)
    GROUP BY ar.attendance_date
  )
  SELECT d.d, COALESCE(pd.present, 0), GREATEST(t.t - COALESCE(pd.present, 0), 0), t.t
  FROM days d CROSS JOIN total t LEFT JOIN per_day pd ON pd.d = d.d
  ORDER BY d.d;
END;
$$;
GRANT EXECUTE ON FUNCTION daily_attendance_trend(text, int) TO authenticated;
