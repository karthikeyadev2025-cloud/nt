/*
  # Leave entitlements & balances (2026-07-25)

  Previously leave requests had a type but no balance to check against — an
  employee couldn't see how many days they had left, and an approver was
  approving against nothing.

  Design note: balances are DERIVED, not stored as a running counter.
  We store only the entitlement policy; usage is computed from approved
  leave_requests on demand. A stored counter would drift the moment a request
  is edited, deleted, or back-dated — this can't.

  1. leave_policies — annual entitlement per leave type, optionally per role.
  2. leave_working_days() — counts working days in a range using the staff
     member's assigned shift (same rule payroll uses), so weekends inside a
     leave range aren't charged against the balance.
  3. get_leave_balances() — entitled / used / pending / remaining per type.
  4. A guard trigger blocks approving leave that would exceed the entitlement,
     unless it's unpaid leave or the approver explicitly overrides.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Entitlement policy
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS leave_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type text NOT NULL CHECK (leave_type IN ('casual','sick','earned','unpaid','other')),
  role_name text,                       -- NULL = applies to everyone
  annual_days numeric NOT NULL DEFAULT 0,
  is_unlimited boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (leave_type, role_name)
);
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read leave policies" ON leave_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manages leave policies" ON leave_policies FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff'))
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

-- Defaults typical for an Indian SMB. Adjust under HR without a migration.
INSERT INTO leave_policies (leave_type, role_name, annual_days, is_unlimited) VALUES
  ('casual', NULL, 12, false),
  ('sick',   NULL, 6,  false),
  ('earned', NULL, 15, false),
  ('other',  NULL, 3,  false),
  ('unpaid', NULL, 0,  true)
ON CONFLICT (leave_type, role_name) DO NOTHING;

-- Approver override for exceptional cases (kept out of the guarded-column list
-- since only approvers can update leave_requests anyway).
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS override_balance boolean NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════
-- 2. Working-day count for a leave range (respects the staff shift)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION leave_working_days(_staff_user_id uuid, _from date, _to date)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  wd int[];
  d date;
  total numeric := 0;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RETURN 0;
  END IF;

  SELECT sh.working_days INTO wd
  FROM staff_shifts ss JOIN shifts sh ON sh.id = ss.shift_id
  WHERE ss.staff_user_id = _staff_user_id AND ss.effective_to IS NULL
  ORDER BY ss.created_at DESC LIMIT 1;

  -- No shift assigned → assume Mon–Sat, matching the payroll fallback.
  IF wd IS NULL THEN
    wd := ARRAY[1,2,3,4,5,6];
  END IF;

  d := _from;
  WHILE d <= _to LOOP
    -- EXTRACT(isodow) gives 1=Mon .. 7=Sun
    IF EXTRACT(isodow FROM d)::int = ANY(wd) THEN
      total := total + 1;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN total;
END;
$$;
GRANT EXECUTE ON FUNCTION leave_working_days(uuid, date, date) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Derived balances
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_leave_balances(_staff_user_id uuid, _year int DEFAULT NULL)
RETURNS TABLE (
  leave_type text,
  entitled numeric,
  is_unlimited boolean,
  used numeric,
  pending numeric,
  remaining numeric
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  yr int := COALESCE(_year, EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int);
  y_start date := make_date(yr, 1, 1);
  y_end   date := make_date(yr, 12, 31);
  target_role text;
BEGIN
  -- Visible to the employee themselves, or to someone who can approve/see them.
  IF _staff_user_id <> auth.uid()
     AND NOT is_super_admin()
     AND NOT (has_permission('approve_leaves') AND can_access_staff(_staff_user_id))
     AND NOT (has_permission('view_staff') AND can_access_staff(_staff_user_id))
  THEN
    RAISE EXCEPTION 'Not authorized to view this leave balance';
  END IF;

  SELECT u.role INTO target_role FROM app_users u WHERE u.id = _staff_user_id;

  RETURN QUERY
  WITH policy AS (
    SELECT DISTINCT ON (p.leave_type)
      p.leave_type, p.annual_days, p.is_unlimited
    FROM leave_policies p
    WHERE p.role_name IS NULL OR p.role_name = target_role
    -- Role-specific policy wins over the company-wide default.
    ORDER BY p.leave_type, (p.role_name IS NULL)
  ),
  taken AS (
    SELECT
      lr.leave_type AS lt,
      SUM(leave_working_days(
        _staff_user_id,
        GREATEST(lr.from_date, y_start),
        LEAST(lr.to_date, y_end)
      )) FILTER (WHERE lr.status = 'approved') AS used_days,
      SUM(leave_working_days(
        _staff_user_id,
        GREATEST(lr.from_date, y_start),
        LEAST(lr.to_date, y_end)
      )) FILTER (WHERE lr.status = 'pending') AS pending_days
    FROM leave_requests lr
    WHERE lr.staff_user_id = _staff_user_id
      AND lr.from_date <= y_end AND lr.to_date >= y_start
    GROUP BY lr.leave_type
  )
  SELECT
    policy.leave_type,
    policy.annual_days,
    policy.is_unlimited,
    COALESCE(taken.used_days, 0),
    COALESCE(taken.pending_days, 0),
    CASE WHEN policy.is_unlimited THEN NULL
         ELSE policy.annual_days - COALESCE(taken.used_days, 0) END
  FROM policy LEFT JOIN taken ON taken.lt = policy.leave_type
  ORDER BY policy.leave_type;
END;
$$;
GRANT EXECUTE ON FUNCTION get_leave_balances(uuid, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. Block over-approval
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tg_leave_balance_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  yr int;
  pol record;
  already numeric;
  this_request numeric;
BEGIN
  -- Only when a request transitions into 'approved'.
  IF NOT (NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;
  -- Unpaid leave and explicit overrides bypass the entitlement check.
  IF NEW.leave_type = 'unpaid' OR NEW.override_balance THEN
    RETURN NEW;
  END IF;

  yr := EXTRACT(year FROM NEW.from_date)::int;

  SELECT DISTINCT ON (p.leave_type) p.annual_days, p.is_unlimited INTO pol
  FROM leave_policies p
  JOIN app_users u ON u.id = NEW.staff_user_id
  WHERE p.leave_type = NEW.leave_type
    AND (p.role_name IS NULL OR p.role_name = u.role)
  ORDER BY p.leave_type, (p.role_name IS NULL);

  IF pol IS NULL OR pol.is_unlimited THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(leave_working_days(NEW.staff_user_id, lr.from_date, lr.to_date)), 0)
    INTO already
  FROM leave_requests lr
  WHERE lr.staff_user_id = NEW.staff_user_id
    AND lr.leave_type = NEW.leave_type
    AND lr.status = 'approved'
    AND lr.id <> NEW.id
    AND EXTRACT(year FROM lr.from_date)::int = yr;

  this_request := leave_working_days(NEW.staff_user_id, NEW.from_date, NEW.to_date);

  IF already + this_request > pol.annual_days THEN
    RAISE EXCEPTION
      'Approving this would exceed the % leave entitlement (% of % days already used, this request is % day(s)). Mark it unpaid or tick Override to proceed.',
      NEW.leave_type, already, pol.annual_days, this_request;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leave_balance_guard ON leave_requests;
CREATE TRIGGER trg_leave_balance_guard
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION tg_leave_balance_guard();
