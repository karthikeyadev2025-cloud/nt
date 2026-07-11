/*
  # Features ported from Punchly (smart-timekeeper): notifications, announcements,
  # shift swaps, bank-detail change approval, staff ID codes.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Notifications (generic, in-app bell)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION notify_user(p_user_id uuid, p_kind text, p_title text, p_body text, p_link text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO notifications (user_id, kind, title, body, link) VALUES (p_user_id, p_kind, p_title, p_body, p_link);
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Announcements (segment-scoped, notifies relevant staff)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE CASCADE,  -- null = all staff
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean DEFAULT false,
  expires_at timestamptz,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read announcements" ON announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage announcements" ON announcements FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff')) WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

CREATE OR REPLACE FUNCTION tg_announcement_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM app_users
    WHERE is_active = true
      AND (NEW.segment_slug IS NULL OR NEW.segment_slug = ANY(segments) OR 'all' = ANY(segments))
  LOOP
    PERFORM notify_user(r.id, 'announcement', '📢 ' || NEW.title, NEW.body, '/portal');
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_announcement_notify ON announcements;
CREATE TRIGGER trg_announcement_notify AFTER INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION tg_announcement_notify();

-- ═══════════════════════════════════════════════════════════════
-- 3. Shift Swap Requests (staff-to-staff, manager/HR approves)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  shift_date date NOT NULL,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own swap requests" ON shift_swap_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid() OR has_permission('approve_leaves') OR is_super_admin());
CREATE POLICY "create swap request" ON shift_swap_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY "review swap request" ON shift_swap_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_leaves') OR is_super_admin()) WITH CHECK (has_permission('approve_leaves') OR is_super_admin());

CREATE OR REPLACE FUNCTION tg_shift_swap_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE managers record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_id IS NOT NULL THEN
      PERFORM notify_user(NEW.target_id, 'shift_swap', 'Shift swap requested', 'Someone requested to swap shifts with you on ' || NEW.shift_date, '/portal');
    END IF;
    FOR managers IN SELECT id FROM app_users WHERE is_active AND role IN ('manager','hr','super_admin') LOOP
      PERFORM notify_user(managers.id, 'shift_swap', 'New shift swap request', 'A shift swap request needs review.', '/portal');
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    PERFORM notify_user(NEW.requester_id, 'shift_swap', 'Shift swap ' || NEW.status, 'Your shift swap request was ' || NEW.status || '.', '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_shift_swap_notify ON shift_swap_requests;
CREATE TRIGGER trg_shift_swap_notify AFTER INSERT OR UPDATE ON shift_swap_requests FOR EACH ROW EXECUTE FUNCTION tg_shift_swap_notify();

-- ═══════════════════════════════════════════════════════════════
-- 4. Bank Details + Change Approval (protects payroll from silent edits)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bank_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS staff_code text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS staff_code_seq;
CREATE OR REPLACE FUNCTION set_staff_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.staff_code IS NULL THEN
    NEW.staff_code := 'NKT-EMP-' || LPAD(nextval('staff_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_staff_code ON app_users;
CREATE TRIGGER trg_staff_code BEFORE INSERT ON app_users FOR EACH ROW EXECUTE FUNCTION set_staff_code();

CREATE TABLE IF NOT EXISTS bank_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  requested_details jsonb NOT NULL,   -- {account_holder, account_number, ifsc, bank_name, upi_id}
  previous_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bank_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank requests" ON bank_change_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('approve_advances') OR has_permission('view_payroll') OR is_super_admin());
CREATE POLICY "request bank change" ON bank_change_requests FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE POLICY "review bank change" ON bank_change_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_advances') OR is_super_admin()) WITH CHECK (has_permission('approve_advances') OR is_super_admin());

-- Applies the change to app_users.bank_details once approved, and notifies the employee.
CREATE OR REPLACE FUNCTION tg_bank_change_resolved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    UPDATE app_users SET bank_details = NEW.requested_details WHERE id = NEW.staff_user_id;
    PERFORM notify_user(NEW.staff_user_id, 'bank_change', 'Bank details approved', 'Your bank detail change has been approved and applied.', '/portal');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    PERFORM notify_user(NEW.staff_user_id, 'bank_change', 'Bank details rejected', COALESCE(NEW.review_note, 'Your bank detail change request was rejected.'), '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bank_change_resolved ON bank_change_requests;
CREATE TRIGGER trg_bank_change_resolved AFTER UPDATE ON bank_change_requests FOR EACH ROW EXECUTE FUNCTION tg_bank_change_resolved();
