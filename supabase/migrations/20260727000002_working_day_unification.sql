/*
  # Working-day unification + service-role fix (2026-07-27)

  Three bugs, one root cause: working-day math was implemented three times
  (JS in payroll.tsx, leave_working_days(), count_working_days()) and no two
  agreed. The holiday calendar added in 20260726000001 was wired to nothing —
  count_working_days() had zero callers, so payroll still counted national
  holidays as absences and deducted wages for them.

  1. working_days_between() — the single source of truth. Shift-aware AND
     holiday-aware. Everything else now delegates to it.
  2. leave_working_days() — kept (callers exist) but now delegates, so leave
     stops charging employees for holidays.
  3. count_working_days() — kept for compatibility, now delegates instead of
     hardcoding "exclude Sundays".
  4. staff_working_days_in_month() — what payroll calls, so the frontend stops
     doing its own holiday-blind arithmetic.
  5. Service-role lockout on the privileged-column guard trigger.
  6. HR can file leave on behalf of staff (sick calls).
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Single source of truth for working days
-- ═══════════════════════════════════════════════════════════════
-- _staff_user_id NULL  → fall back to Mon–Sat (company default)
-- _segment_slug NULL   → company-wide holidays only
-- Optional holidays are NOT excluded: staff may work them.
CREATE OR REPLACE FUNCTION working_days_between(
  _from date,
  _to date,
  _staff_user_id uuid DEFAULT NULL,
  _segment_slug text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  wd int[];
  seg text := _segment_slug;
  total numeric := 0;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RETURN 0;
  END IF;

  IF _staff_user_id IS NOT NULL THEN
    SELECT sh.working_days INTO wd
    FROM staff_shifts ss JOIN shifts sh ON sh.id = ss.shift_id
    WHERE ss.staff_user_id = _staff_user_id AND ss.effective_to IS NULL
    ORDER BY ss.created_at DESC LIMIT 1;

    -- Holidays can be segment-scoped; derive the staff member's segment when
    -- one wasn't passed. Multi-segment staff use their first segment.
    IF seg IS NULL THEN
      SELECT u.segments[1] INTO seg FROM app_users u WHERE u.id = _staff_user_id;
      IF seg = 'all' THEN seg := NULL; END IF;
    END IF;
  END IF;

  IF wd IS NULL THEN
    wd := ARRAY[1,2,3,4,5,6];   -- Mon–Sat default, matches seeded General Shift
  END IF;

  SELECT COUNT(*)::numeric INTO total
  FROM generate_series(_from, _to, '1 day'::interval) d
  WHERE EXTRACT(isodow FROM d)::int = ANY(wd)
    AND NOT EXISTS (
      SELECT 1 FROM holidays h
      WHERE h.holiday_date = d::date
        AND h.is_optional = false
        AND (h.segment_slug IS NULL OR h.segment_slug = seg)
    );

  RETURN total;
END;
$$;
GRANT EXECUTE ON FUNCTION working_days_between(date, date, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. Leave day counting now excludes holidays
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION leave_working_days(_staff_user_id uuid, _from date, _to date)
RETURNS numeric
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT working_days_between(_from, _to, _staff_user_id, NULL);
$$;
GRANT EXECUTE ON FUNCTION leave_working_days(uuid, date, date) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Legacy helper delegates (was hardcoding Sundays-only)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION count_working_days(_from date, _to date, _segment_slug text DEFAULT NULL)
RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT working_days_between(_from, _to, NULL, _segment_slug)::int;
$$;
GRANT EXECUTE ON FUNCTION count_working_days(date, date, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. What payroll calls — replaces the frontend's own arithmetic
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION staff_working_days_in_month(_staff_user_id uuid, _year int, _month int)
RETURNS numeric
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT working_days_between(
    make_date(_year, _month, 1),
    (make_date(_year, _month, 1) + interval '1 month - 1 day')::date,
    _staff_user_id,
    NULL
  );
$$;
GRANT EXECUTE ON FUNCTION staff_working_days_in_month(uuid, int, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 5. Service-role lockout fix
-- ═══════════════════════════════════════════════════════════════
-- is_super_admin() and has_permission() both read auth.uid(), which is NULL
-- for service-role callers (edge functions, SQL Editor, cron, migrations).
-- The guard therefore blocked legitimate backend admin work — e.g. fixing a
-- user's segment from the dashboard. RLS already prevents anon from reaching
-- app_users, so a NULL uid here means a trusted server-side caller.
CREATE OR REPLACE FUNCTION tg_guard_app_user_privileged_cols() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() OR has_permission('manage_staff') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.segments IS DISTINCT FROM OLD.segments
     OR NEW.permission_overrides IS DISTINCT FROM OLD.permission_overrides
     OR NEW.salary_structure IS DISTINCT FROM OLD.salary_structure
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.staff_code IS DISTINCT FROM OLD.staff_code
     OR NEW.designation IS DISTINCT FROM OLD.designation
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged account fields';
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 6. HR may file leave on behalf of staff (phoned-in sick days)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "create own leave" ON leave_requests;
DROP POLICY IF EXISTS "request leave" ON leave_requests;
CREATE POLICY "request leave" ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    staff_user_id = auth.uid()
    OR (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
  );
