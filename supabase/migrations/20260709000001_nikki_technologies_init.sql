/*
  # Nikki Technologies — Consolidated Initial Schema
  One backend, multi-segment (CCTV | Digital Media | Software Solutions).

  ## Core concepts
  - segments: dynamic business verticals (add a 4th from Super Admin, no code)
  - app_users: role + segments[] + permission overrides (jsonb)
  - Super Admin ('super_admin' role) controls everything via CSS panel
  - HR is centralized (segments = {all}) but all views group by segment
  - products: Software Solutions catalog (MyStore OS, Punchly, Jovio...) — link-out model
  - support_tickets: per-segment ticketing with per-segment ticket types
  - marketing_leads: enterprise CRM pipeline, segment-routed
  - attendance / salary advances / leaves: shared payroll backend
  - site_content: full no-code CMS
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. SEGMENTS (dynamic verticals)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tagline text DEFAULT '',
  description text DEFAULT '',
  icon text DEFAULT 'Layers',
  color text DEFAULT '#0ea5e9',
  ticket_prefix text NOT NULL,
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO segments (slug, name, tagline, description, icon, color, ticket_prefix, order_index) VALUES
  ('cctv', 'CCTV Installation', 'Complete Security Surveillance', 'Professional CCTV camera installation, AMC and repair services for homes, offices and industries.', 'Camera', '#f59e0b', 'CC', 1),
  ('digital_media', 'Digital Media', 'Grow Your Brand Online', 'Digital marketing, social media management, branding, video production and performance ads.', 'Megaphone', '#ec4899', 'DM', 2),
  ('software', 'Software Solutions', 'SaaS Products & Custom Software', 'Our own SaaS products and custom software development for businesses.', 'Code2', '#0ea5e9', 'SW', 3)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 2. USERS, ROLES & PERMISSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text NOT NULL UNIQUE,
  description text DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Default permission sets per role (function-level flags)
INSERT INTO role_permissions (role_name, description, permissions, is_system) VALUES
  ('super_admin', 'Full control of entire system', '{"all": true}'::jsonb, true),
  ('manager', 'Segment manager', '{"view_leads": true, "manage_leads": true, "view_tickets": true, "manage_tickets": true, "assign_tickets": true, "view_staff": true, "view_attendance": true, "approve_leaves": true, "view_reports": true}'::jsonb, true),
  ('hr', 'Central HR - all segments', '{"view_staff": true, "manage_staff": true, "view_attendance": true, "approve_leaves": true, "approve_advances": true, "view_payroll": true, "manage_payroll": true, "view_reports": true}'::jsonb, true),
  ('marketing_executive', 'Field marketing executive', '{"view_leads": true, "manage_leads": true, "create_leads": true}'::jsonb, true),
  ('telecaller', 'Telecaller', '{"view_leads": true, "manage_leads": true}'::jsonb, true),
  ('support_agent', 'Ticket support agent', '{"view_tickets": true, "manage_tickets": true}'::jsonb, true),
  ('employee', 'General employee (self-service portal)', '{}'::jsonb, true)
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('super_admin','manager','hr','marketing_executive','telecaller','support_agent','employee')),
  segments text[] NOT NULL DEFAULT '{}',           -- e.g. {cctv} or {cctv,software} or {all}
  permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,  -- super admin per-user grants/revokes
  phone text DEFAULT '',
  designation text DEFAULT '',
  monthly_salary numeric(12,2) DEFAULT 0,
  profile_photo_url text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_segments ON app_users USING gin(segments);

-- ── Helper functions (SECURITY DEFINER to avoid RLS recursion) ──
CREATE OR REPLACE FUNCTION get_my_role() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM app_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_segments() RETURNS text[]
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(segments, '{}') FROM app_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'super_admin' AND is_active);
$$;

CREATE OR REPLACE FUNCTION can_access_segment(seg text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT is_super_admin()
      OR 'all' = ANY(get_my_segments())
      OR seg = ANY(get_my_segments());
$$;

CREATE OR REPLACE FUNCTION has_permission(perm text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  u record;
  role_perms jsonb;
BEGIN
  SELECT role, permission_overrides INTO u FROM app_users WHERE id = auth.uid() AND is_active;
  IF u IS NULL THEN RETURN false; END IF;
  IF u.role = 'super_admin' THEN RETURN true; END IF;
  -- per-user override wins
  IF u.permission_overrides ? perm THEN
    RETURN (u.permission_overrides ->> perm)::boolean;
  END IF;
  SELECT permissions INTO role_perms FROM role_permissions WHERE role_name = u.role;
  RETURN COALESCE((role_perms ->> perm)::boolean, false);
END;
$$;

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile" ON app_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_super_admin() OR has_permission('view_staff'));
CREATE POLICY "super admin manages users" ON app_users FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));
CREATE POLICY "super admin updates users" ON app_users FOR UPDATE TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff') OR id = auth.uid())
  WITH CHECK (is_super_admin() OR has_permission('manage_staff') OR id = auth.uid());
CREATE POLICY "super admin deletes users" ON app_users FOR DELETE TO authenticated
  USING (is_super_admin());

CREATE POLICY "authenticated read roles" ON role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manages roles" ON role_permissions FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "public read active segments" ON segments FOR SELECT USING (active = true OR is_super_admin());
CREATE POLICY "super admin manages segments" ON segments FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ═══════════════════════════════════════════════════════════════
-- 3. CMS — SITE CONTENT (no-code editing of entire public site)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  key text NOT NULL,
  value text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, key)
);
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read content" ON site_content FOR SELECT USING (true);
CREATE POLICY "cms manage content" ON site_content FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO site_content (section, key, value, type) VALUES
  ('hero','title','Nikki Technologies','text'),
  ('hero','subtitle','CCTV • Digital Media • Software','text'),
  ('hero','description','One technology partner for security surveillance, digital growth and software products. Trusted by businesses across Telangana & Andhra Pradesh.','text'),
  ('contact','phone','+91 00000 00000','text'),
  ('contact','whatsapp','+91 00000 00000','text'),
  ('contact','email','info@nikkitechnologies.com','text'),
  ('contact','address','Hyderabad, Telangana, India','text'),
  ('footer','about','Nikki Technologies — CCTV installation, digital media and software solutions under one roof.','text')
ON CONFLICT (section, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. SERVICES (per segment)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text NOT NULL REFERENCES segments(slug) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'Settings',
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read services" ON services FOR SELECT USING (active = true OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage services" ON services FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO services (segment_slug, title, description, icon, order_index) VALUES
  ('cctv','CCTV Installation','HD & IP camera installation for homes, shops, offices and industries with mobile viewing.','Camera',1),
  ('cctv','AMC & Maintenance','Annual maintenance contracts, repairs and DVR/NVR upgrades.','Wrench',2),
  ('cctv','Biometric & Access Control','Attendance systems, video door phones and access control.','Shield',3),
  ('digital_media','Social Media Marketing','Instagram, Facebook, YouTube growth with content calendars and ads.','Megaphone',1),
  ('digital_media','Branding & Design','Logos, brand kits, posters, reels and video production.','Palette',2),
  ('digital_media','Performance Ads','Google & Meta ads with tracked ROI and lead funnels.','TrendingUp',3),
  ('software','SaaS Products','Our own products — retail billing, payroll and AI voice.','Boxes',1),
  ('software','Custom Software','Web apps, mobile apps and business automation built to order.','Code2',2),
  ('software','AI Solutions','AI voice bots, chatbots and workflow automation.','Bot',3);

-- ═══════════════════════════════════════════════════════════════
-- 5. PRODUCTS (Software Solutions catalog — link-out)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text NOT NULL DEFAULT 'software' REFERENCES segments(slug) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tagline text DEFAULT '',
  description text DEFAULT '',
  logo_url text,
  screenshots jsonb DEFAULT '[]'::jsonb,
  features jsonb DEFAULT '[]'::jsonb,           -- [{title, description, icon}]
  external_url text,                            -- link-out to live product
  demo_cta text DEFAULT 'Visit Website',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','coming_soon','hidden')),
  order_index int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read products" ON products FOR SELECT USING (status <> 'hidden' OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage products" ON products FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO products (slug, name, tagline, description, external_url, features, order_index) VALUES
  ('mystore-os','MyStore OS','Multi-tenant Retail & Service Billing','Complete billing, inventory and store management platform for Indian retail and service businesses. GST invoices, thermal printing, multi-store support.','https://mystoreos.in',
   '[{"title":"GST Billing","description":"Retail & service invoices with thermal print","icon":"Receipt"},{"title":"Inventory","description":"Stock, low-stock alerts and reports","icon":"Package"},{"title":"Multi-tenant","description":"Multiple stores, one platform","icon":"Store"}]'::jsonb, 1),
  ('punchly','Punchly','Attendance & Payroll SaaS','Selfie + GPS attendance, shift management, leave workflows and one-click payroll with Excel reports. Android app included.','https://punchly.online',
   '[{"title":"Smart Attendance","description":"Selfie + GPS check-in, night shifts supported","icon":"Clock"},{"title":"Payroll","description":"Salary, advances and Excel reports","icon":"IndianRupee"},{"title":"Mobile App","description":"Android app for every employee","icon":"Smartphone"}]'::jsonb, 2),
  ('jovio','Jovio AI Voice','Telugu AI Voice Receptionist','AI-powered voice receptionist that answers business calls in Telugu and English — books appointments, answers FAQs, 24/7.','https://jovio.in',
   '[{"title":"Telugu Voice AI","description":"Natural Telugu + English conversations","icon":"Mic"},{"title":"24/7 Reception","description":"Never miss a customer call","icon":"PhoneCall"},{"title":"Smart Routing","description":"Appointments, FAQs and escalation","icon":"GitBranch"}]'::jsonb, 3);

-- ═══════════════════════════════════════════════════════════════
-- 6. SUPPORT TICKETS (per-segment, separate views)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text NOT NULL REFERENCES segments(slug) ON DELETE CASCADE,
  name text NOT NULL,
  order_index int DEFAULT 0,
  active boolean DEFAULT true
);
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read ticket types" ON ticket_types FOR SELECT USING (active = true OR is_super_admin());
CREATE POLICY "manage ticket types" ON ticket_types FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO ticket_types (segment_slug, name, order_index) VALUES
  ('cctv','New Installation',1),('cctv','Camera Not Working',2),('cctv','DVR/NVR Issue',3),('cctv','AMC Request',4),('cctv','Other',5),
  ('digital_media','Campaign Issue',1),('digital_media','Design Request',2),('digital_media','Account/Billing',3),('digital_media','Other',4),
  ('software','Bug Report',1),('software','Feature Request',2),('software','Account/Billing',3),('software','Demo Request',4),('software','Other',5);

CREATE SEQUENCE IF NOT EXISTS ticket_seq;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text UNIQUE NOT NULL DEFAULT '',
  segment_slug text NOT NULL REFERENCES segments(slug),
  ticket_type text NOT NULL DEFAULT 'Other',
  subject text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text DEFAULT '',
  product_slug text,                            -- optional: which product (software tickets)
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE OR REPLACE FUNCTION set_ticket_no() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE prefix text;
BEGIN
  IF NEW.ticket_no = '' OR NEW.ticket_no IS NULL THEN
    SELECT ticket_prefix INTO prefix FROM segments WHERE slug = NEW.segment_slug;
    NEW.ticket_no := 'NKT-' || COALESCE(prefix,'GN') || '-' || LPAD(nextval('ticket_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_no ON support_tickets;
CREATE TRIGGER trg_ticket_no BEFORE INSERT ON support_tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_no();

CREATE INDEX IF NOT EXISTS idx_tickets_segment ON support_tickets(segment_slug, status);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Public can create tickets (Raise a Ticket form)
CREATE POLICY "anyone can raise ticket" ON support_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "staff view segment tickets" ON support_tickets FOR SELECT TO authenticated
  USING (has_permission('view_tickets') AND can_access_segment(segment_slug));
CREATE POLICY "staff manage segment tickets" ON support_tickets FOR UPDATE TO authenticated
  USING (has_permission('manage_tickets') AND can_access_segment(segment_slug))
  WITH CHECK (has_permission('manage_tickets') AND can_access_segment(segment_slug));
CREATE POLICY "super admin deletes tickets" ON support_tickets FOR DELETE TO authenticated USING (is_super_admin());

CREATE TABLE IF NOT EXISTS ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  is_staff boolean DEFAULT true,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view replies" ON ticket_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND has_permission('view_tickets') AND can_access_segment(t.segment_slug)));
CREATE POLICY "staff add replies" ON ticket_replies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND has_permission('manage_tickets') AND can_access_segment(t.segment_slug)));

-- ═══════════════════════════════════════════════════════════════
-- 7. CRM — LEADS (segment-routed pipeline)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text NOT NULL REFERENCES segments(slug),
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text DEFAULT '',
  address text DEFAULT '',
  interested_in text DEFAULT '',
  product_slug text,
  source text DEFAULT 'website' CHECK (source IN ('website','field','telecall','referral','whatsapp','other')),
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','quoted','won','lost','not_answered')),
  estimated_value numeric(12,2) DEFAULT 0,
  invoice_no text,
  invoice_amount numeric(12,2),
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  photo_url text,
  latitude double precision,
  longitude double precision,
  next_followup_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_segment_stage ON marketing_leads(segment_slug, stage);
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can submit lead" ON marketing_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "staff view segment leads" ON marketing_leads FOR SELECT TO authenticated
  USING (has_permission('view_leads') AND (can_access_segment(segment_slug) OR assigned_to = auth.uid() OR created_by = auth.uid()));
CREATE POLICY "staff update segment leads" ON marketing_leads FOR UPDATE TO authenticated
  USING (has_permission('manage_leads') AND (can_access_segment(segment_slug) OR assigned_to = auth.uid()))
  WITH CHECK (has_permission('manage_leads'));
CREATE POLICY "super admin deletes leads" ON marketing_leads FOR DELETE TO authenticated USING (is_super_admin());

CREATE TABLE IF NOT EXISTS lead_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  call_type text DEFAULT 'outgoing' CHECK (call_type IN ('outgoing','incoming','visit','whatsapp','email','note')),
  remark text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE lead_remarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view remarks" ON lead_remarks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM marketing_leads l WHERE l.id = lead_id AND has_permission('view_leads') AND (can_access_segment(l.segment_slug) OR l.assigned_to = auth.uid() OR l.created_by = auth.uid())));
CREATE POLICY "staff add remarks" ON lead_remarks FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_leads'));

-- ═══════════════════════════════════════════════════════════════
-- 8. HR / PAYROLL (shared backend, segment-grouped views)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in_at timestamptz,
  check_in_selfie_url text,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_at timestamptz,
  check_out_selfie_url text,
  check_out_lat double precision,
  check_out_lng double precision,
  status text DEFAULT 'present' CHECK (status IN ('present','half_day','absent','leave','holiday')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(staff_user_id, attendance_date)
);
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attendance" ON attendance_records FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('view_attendance'));
CREATE POLICY "self check in" ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid() OR has_permission('manage_payroll'));
CREATE POLICY "self check out" ON attendance_records FOR UPDATE TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('manage_payroll'))
  WITH CHECK (staff_user_id = auth.uid() OR has_permission('manage_payroll'));

CREATE TABLE IF NOT EXISTS salary_advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE salary_advance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own advances" ON salary_advance_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('approve_advances') OR has_permission('view_payroll'));
CREATE POLICY "request advance" ON salary_advance_requests FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE POLICY "hr reviews advances" ON salary_advance_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_advances')) WITH CHECK (has_permission('approve_advances'));

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  leave_type text DEFAULT 'casual' CHECK (leave_type IN ('casual','sick','earned','unpaid','other')),
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leaves" ON leave_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR has_permission('approve_leaves'));
CREATE POLICY "request leave" ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid());
CREATE POLICY "approve leaves" ON leave_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_leaves')) WITH CHECK (has_permission('approve_leaves'));

-- ═══════════════════════════════════════════════════════════════
-- 9. PUBLIC SITE EXTRAS (gallery, testimonials, team, forms)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  title text DEFAULT '',
  image_url text NOT NULL,
  media_type text DEFAULT 'image' CHECK (media_type IN ('image','video')),
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read gallery" ON gallery_items FOR SELECT USING (active = true OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage gallery" ON gallery_items FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  customer_name text NOT NULL,
  content text NOT NULL,
  rating int DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  photo_url text,
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read testimonials" ON testimonials FOR SELECT USING (active = true OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage testimonials" ON testimonials FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  name text NOT NULL,
  designation text DEFAULT '',
  photo_url text,
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read team" ON team_members FOR SELECT USING (active = true OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage team" ON team_members FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text DEFAULT '',
  message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public submit contact" ON contact_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "staff read contacts" ON contact_messages FOR SELECT TO authenticated
  USING (is_super_admin() OR has_permission('view_leads'));

CREATE TABLE IF NOT EXISTS career_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text DEFAULT '',
  position text DEFAULT '',
  experience text DEFAULT '',
  message text DEFAULT '',
  photo_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE career_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public apply career" ON career_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "hr read careers" ON career_applications FOR SELECT TO authenticated
  USING (is_super_admin() OR has_permission('view_staff'));

-- ═══════════════════════════════════════════════════════════════
-- 10. SECURITY AUDIT LOGS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text DEFAULT '',
  event_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_hint text DEFAULT '',
  user_agent text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own logs" ON security_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon insert login logs" ON security_audit_logs FOR INSERT TO anon WITH CHECK (event_type IN ('login_failed','login_success'));
CREATE POLICY "super admin reads logs" ON security_audit_logs FOR SELECT TO authenticated USING (is_super_admin());

-- ═══════════════════════════════════════════════════════════════
-- 11. STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES
  ('site-photos','site-photos', true),
  ('selfies','selfies', false),
  ('lead-photos','lead-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read site photos" ON storage.objects FOR SELECT USING (bucket_id = 'site-photos');
CREATE POLICY "cms upload site photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-photos' AND (is_super_admin() OR has_permission('manage_content')));
CREATE POLICY "cms delete site photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-photos' AND (is_super_admin() OR has_permission('manage_content')));
CREATE POLICY "staff upload selfies" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('selfies','lead-photos'));
CREATE POLICY "staff read selfies" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('selfies','lead-photos'));
