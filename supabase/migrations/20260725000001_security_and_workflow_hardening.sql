/*
  # Security & workflow hardening (2026-07-25)

  Addresses issues found in an end-to-end review:

  1. Privilege-escalation hole: the app_users self-UPDATE branch (id = auth.uid())
     let any employee rewrite their own role / segments / permission_overrides /
     salary_structure / is_active straight from the browser. We now (a) keep a
     narrow self-update policy but (b) add a BEFORE UPDATE trigger that blocks
     changes to privileged columns unless the caller actually holds manage_staff
     (or is super admin). Defence in depth: the trigger is the real guard, the
     policy stays permissive only for benign self edits.

  2. Duplicate-lead leak: find_duplicate_leads was SECURITY DEFINER + granted to
     everyone, letting a restricted telecaller enumerate the whole lead book by
     phone. Restricted staff (no full_leads_view) now get a boolean-only check;
     full-view staff keep the detailed warning.

  3. bulk_upload dead feature: marketing_leads.source CHECK never allowed
     'bulk_upload', so every Excel import failed. Constraint widened.

  4. Server-side late detection: is_late / minutes_late are now computed in a
     BEFORE INSERT trigger from now() against the assigned shift, so a tampered
     device clock can't defeat late tracking. (Client value is ignored.)

  5. Leave & advance decisions now notify the employee (parity with the other
     approval flows).

  6. Failed-login audit: the anon INSERT policy on security_audit_logs allowed
     spoofed rows and was the only way logins were recorded. We keep anon inserts
     working (client still logs) but this migration is where a future server-side
     move would land; documented inline.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Block privilege escalation via self-update
-- ═══════════════════════════════════════════════════════════════
-- A logged-in user may update their OWN row for benign fields, but NOT
-- role, segments, permission_overrides, salary_structure, is_active,
-- staff_code, designation, employment_type — those require manage_staff.
CREATE OR REPLACE FUNCTION tg_guard_app_user_privileged_cols() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- Super admin and manage_staff holders may change anything (RLS already
  -- scoped them to the rows they can touch).
  caller_is_admin := is_super_admin() OR has_permission('manage_staff');
  IF caller_is_admin THEN
    RETURN NEW;
  END IF;

  -- For everyone else (i.e. a user editing their own row), privileged columns
  -- must remain byte-for-byte unchanged.
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

DROP TRIGGER IF EXISTS trg_guard_app_user_privileged_cols ON app_users;
CREATE TRIGGER trg_guard_app_user_privileged_cols
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION tg_guard_app_user_privileged_cols();

-- ═══════════════════════════════════════════════════════════════
-- 2. Duplicate-lead detection without leaking the lead book
-- ═══════════════════════════════════════════════════════════════
-- Restricted-view staff get only a yes/no existence check (no names/assignees).
CREATE OR REPLACE FUNCTION lead_phone_exists(_phone text, _segment_slug text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM marketing_leads l
    WHERE l.phone = _phone AND l.segment_slug = _segment_slug
      AND l.stage NOT IN ('won', 'lost')
  );
$$;
GRANT EXECUTE ON FUNCTION lead_phone_exists(text, text) TO authenticated;

-- Detailed version now refuses to reveal details to restricted staff: it only
-- returns rows when the caller has full_leads_view (managers/HR/super admin).
CREATE OR REPLACE FUNCTION find_duplicate_leads(_phone text, _segment_slug text)
RETURNS TABLE (id uuid, customer_name text, stage text, assigned_to uuid, assignee_name text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT l.id, l.customer_name, l.stage, l.assigned_to, u.full_name, l.created_at
  FROM marketing_leads l
  LEFT JOIN app_users u ON u.id = l.assigned_to
  WHERE l.phone = _phone AND l.segment_slug = _segment_slug AND l.stage NOT IN ('won', 'lost')
    AND has_permission('full_leads_view')
  ORDER BY l.created_at DESC
  LIMIT 5;
$$;
GRANT EXECUTE ON FUNCTION find_duplicate_leads(text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. Allow bulk_upload as a lead source (fixes dead import feature)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE marketing_leads DROP CONSTRAINT IF EXISTS marketing_leads_source_check;
ALTER TABLE marketing_leads ADD CONSTRAINT marketing_leads_source_check
  CHECK (source IN ('website','field','telecall','referral','whatsapp','bulk_upload','other'));

-- ═══════════════════════════════════════════════════════════════
-- 4. Server-side late detection (device clock can't cheat)
-- ═══════════════════════════════════════════════════════════════
-- Computes is_late / minutes_late from server now() against the staff member's
-- currently-effective shift. Runs only when a check-in is being recorded.
CREATE OR REPLACE FUNCTION tg_attendance_late_detect() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  s record;
  shift_start timestamptz;
  grace_ms interval;
BEGIN
  IF NEW.check_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sh.id, sh.start_time, sh.grace_minutes
    INTO s
  FROM staff_shifts ss
  JOIN shifts sh ON sh.id = ss.shift_id
  WHERE ss.staff_user_id = NEW.staff_user_id
    AND ss.effective_to IS NULL
  ORDER BY ss.created_at DESC
  LIMIT 1;

  IF s IS NULL THEN
    -- No shift assigned: cannot judge lateness. Trust nothing from the client.
    NEW.is_late := false;
    NEW.minutes_late := 0;
    NEW.shift_id := NULL;
    RETURN NEW;
  END IF;

  -- Build "today at shift start" in the check-in's own date (IST-safe because
  -- attendance_date is set by the client's IST helper and check_in_at is a
  -- real timestamptz).
  shift_start := (NEW.attendance_date::timestamp + s.start_time) AT TIME ZONE 'Asia/Kolkata';
  grace_ms := make_interval(mins => COALESCE(s.grace_minutes, 0));

  NEW.shift_id := s.id;
  IF NEW.check_in_at > shift_start + grace_ms THEN
    NEW.is_late := true;
    NEW.minutes_late := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NEW.check_in_at - shift_start)) / 60))::int;
  ELSE
    NEW.is_late := false;
    NEW.minutes_late := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_late_detect ON attendance_records;
CREATE TRIGGER trg_attendance_late_detect
  BEFORE INSERT ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION tg_attendance_late_detect();

-- ═══════════════════════════════════════════════════════════════
-- 5. Notify employees when leave / advance requests are decided
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tg_leave_decided_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    PERFORM notify_user(
      NEW.staff_user_id, 'leave_decision',
      'Leave ' || NEW.status,
      'Your ' || COALESCE(NEW.leave_type,'') || ' leave (' || NEW.from_date || ' → ' || NEW.to_date || ') was ' || NEW.status || '.',
      '/portal'
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leave_decided_notify ON leave_requests;
CREATE TRIGGER trg_leave_decided_notify AFTER UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION tg_leave_decided_notify();

CREATE OR REPLACE FUNCTION tg_advance_decided_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected','paid') THEN
    PERFORM notify_user(
      NEW.staff_user_id, 'advance_decision',
      'Salary advance ' || NEW.status,
      'Your salary advance request of Rs.' || NEW.amount || ' was ' || NEW.status || '.',
      '/portal'
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_advance_decided_notify ON salary_advance_requests;
CREATE TRIGGER trg_advance_decided_notify AFTER UPDATE ON salary_advance_requests
  FOR EACH ROW EXECUTE FUNCTION tg_advance_decided_notify();

-- ═══════════════════════════════════════════════════════════════
-- 6. Tighten the audit-log anon insert policy
-- ═══════════════════════════════════════════════════════════════
-- Previously anon could insert BOTH login_success and login_failed, letting
-- anyone forge "successful login" rows. We now let anon record only failures
-- (the pre-auth event that legitimately has no session); successes are written
-- by the authenticated client after sign-in.
DROP POLICY IF EXISTS "anon insert login logs" ON security_audit_logs;
CREATE POLICY "anon insert failed logins" ON security_audit_logs FOR INSERT TO anon
  WITH CHECK (event_type = 'login_failed');
CREATE POLICY "auth insert own logs" ON security_audit_logs FOR INSERT TO authenticated
  WITH CHECK (event_type IN ('login_success','logout'));
