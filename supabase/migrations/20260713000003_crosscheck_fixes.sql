/*
  # Cross-check fixes: photo change approval, ID/emergency fields, promotion history, late detection
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Profile photo change approval (same pattern as bank_change_requests)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS blood_group text DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS id_proof_number text DEFAULT '';

CREATE TABLE IF NOT EXISTS photo_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  requested_photo_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE photo_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photo requests" ON photo_change_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('manage_staff') OR is_super_admin());
CREATE POLICY "request photo change" ON photo_change_requests FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE POLICY "review photo change" ON photo_change_requests FOR UPDATE TO authenticated
  USING (has_permission('manage_staff') OR is_super_admin()) WITH CHECK (has_permission('manage_staff') OR is_super_admin());

CREATE OR REPLACE FUNCTION tg_photo_change_resolved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    UPDATE app_users SET profile_photo_url = NEW.requested_photo_url WHERE id = NEW.staff_user_id;
    PERFORM notify_user(NEW.staff_user_id, 'photo_change', 'Photo approved', 'Your profile photo change was approved.', '/portal');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    PERFORM notify_user(NEW.staff_user_id, 'photo_change', 'Photo rejected', 'Your profile photo change request was rejected.', '/portal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_photo_change_resolved ON photo_change_requests;
CREATE TRIGGER trg_photo_change_resolved AFTER UPDATE ON photo_change_requests FOR EACH ROW EXECUTE FUNCTION tg_photo_change_resolved();

-- ═══════════════════════════════════════════════════════════════
-- 2. Promotions / designation & salary change history (audit trail)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  previous_designation text DEFAULT '',
  new_designation text DEFAULT '',
  previous_ctc numeric(12,2) DEFAULT 0,
  new_ctc numeric(12,2) DEFAULT 0,
  note text DEFAULT '',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own promotions" ON promotions FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('view_staff') OR has_permission('manage_staff') OR is_super_admin());
CREATE POLICY "hr create promotions" ON promotions FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_staff') OR is_super_admin());

CREATE OR REPLACE FUNCTION tg_promotion_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_user(NEW.staff_user_id, 'promotion', 'Role update',
    CASE WHEN NEW.new_designation <> '' AND NEW.new_designation <> NEW.previous_designation
      THEN 'Your designation has been updated to ' || NEW.new_designation || '.'
      ELSE 'Your compensation has been updated.' END, '/portal');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_promotion_notify ON promotions;
CREATE TRIGGER trg_promotion_notify AFTER INSERT ON promotions FOR EACH ROW EXECUTE FUNCTION tg_promotion_notify();

-- ═══════════════════════════════════════════════════════════════
-- 3. Late detection (lighter version of Punchly's grace+fine system)
--    Company-wide grace period in minutes; fine automation is a follow-up, not built here.
-- ═══════════════════════════════════════════════════════════════
INSERT INTO site_content (section, key, value, type) VALUES
  ('attendance', 'default_start_time', '09:30', 'text'),
  ('attendance', 'grace_minutes', '15', 'text')
ON CONFLICT (section, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. Storage: let any staff member upload their own profile-photo request
--    (site-photos bucket is otherwise gated to manage_content/CMS use)
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "staff upload profile photo requests" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-photos' AND name LIKE 'profile-requests/%');
