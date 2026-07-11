/*
  # Onboarding Documents & Salary Transparency
  - document_templates: per-segment templates (offer letter, welcome letter, roles & responsibilities, custom)
  - employee_documents: generated docs issued to a specific employee, with acknowledgement tracking
  - app_users: proper salary structure (basic/hra/allowances/deductions/ctc) + joining date + employment type
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Extend app_users: salary structure + onboarding fields
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS salary_structure jsonb NOT NULL DEFAULT '{"basic":0,"hra":0,"allowances":0,"deductions":0,"ctc":0}'::jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS joining_date date;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Document templates (per segment, reusable, with {{placeholders}})
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE CASCADE,  -- null = applies to all segments
  doc_type text NOT NULL CHECK (doc_type IN ('offer_letter','welcome_letter','roles_responsibilities','policy','other')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',   -- supports {{name}} {{role}} {{designation}} {{segment}} {{joining_date}} {{ctc}} {{company}}
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read templates" ON document_templates FOR SELECT TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff') OR has_permission('view_staff'));
CREATE POLICY "super admin manage templates" ON document_templates FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

INSERT INTO document_templates (segment_slug, doc_type, title, body) VALUES
  (NULL, 'welcome_letter', 'Welcome Letter', E'Dear {{name}},\n\nWelcome to Nikki Technologies! We are delighted to have you join us as {{designation}} in our {{segment}} division, effective {{joining_date}}.\n\nYou are now part of a team building CCTV security solutions, digital media growth and software products for businesses across Telangana and Andhra Pradesh. We look forward to your contributions and growth with us.\n\nIf you have any questions, your manager and HR are always available to help.\n\nWarm regards,\nNikki Technologies'),
  (NULL, 'offer_letter', 'Offer Letter', E'Dear {{name}},\n\nWe are pleased to offer you the position of {{designation}} in the {{segment}} division of Nikki Technologies, reporting from {{joining_date}}.\n\nCompensation (Annual CTC): ₹{{ctc}}\nEmployment Type: {{employment_type}}\n\nThis offer is subject to our standard company policies and code of conduct. Please confirm your acceptance by acknowledging this letter in your staff portal.\n\nWe look forward to working with you.\n\nRegards,\nNikki Technologies HR'),
  ('cctv', 'roles_responsibilities', 'Roles & Responsibilities — CCTV Installation', E'Position: {{designation}}\nDivision: CCTV Installation\n\nKey Responsibilities:\n- Professional installation, testing and configuration of CCTV cameras, DVR/NVR systems and access control devices at client sites\n- Adhere to safety standards during on-site work\n- Complete AMC visits and repair tickets within assigned SLA\n- Maintain accurate records of installations, materials used and site visits\n- Represent Nikki Technologies professionally with clients\n- Report technical issues and stock requirements to the manager promptly\n\nReporting: You report to your CCTV Segment Manager.'),
  ('digital_media', 'roles_responsibilities', 'Roles & Responsibilities — Digital Media', E'Position: {{designation}}\nDivision: Digital Media\n\nKey Responsibilities:\n- Plan and execute social media content calendars for client accounts\n- Design creatives, reels and campaign assets aligned with brand guidelines\n- Manage and optimize paid ad campaigns (Meta/Google) with tracked ROI\n- Coordinate with clients on approvals and campaign feedback\n- Report performance metrics to the manager on a weekly basis\n- Stay current with platform trends and best practices\n\nReporting: You report to your Digital Media Segment Manager.'),
  ('software', 'roles_responsibilities', 'Roles & Responsibilities — Software Solutions', E'Position: {{designation}}\nDivision: Software Solutions\n\nKey Responsibilities:\n- Develop, test and maintain features for Nikki Technologies products and client software projects\n- Follow code review, version control and documentation standards\n- Respond to and resolve support tickets within SLA\n- Collaborate with the team on architecture and technical decisions\n- Communicate blockers and progress clearly and promptly\n- Safeguard client and company data at all times\n\nReporting: You report to your Software Segment Manager.');

-- ═══════════════════════════════════════════════════════════════
-- 3. Employee documents (generated/issued copies, per staff member)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('offer_letter','welcome_letter','roles_responsibilities','policy','other')),
  title text NOT NULL,
  content text NOT NULL,           -- fully rendered (placeholders already filled)
  issued_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  issued_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE(staff_user_id, doc_type, title)
);
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own documents" ON employee_documents FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR has_permission('manage_staff') OR has_permission('view_staff'));
CREATE POLICY "hr issue documents" ON employee_documents FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));
CREATE POLICY "hr update documents" ON employee_documents FOR UPDATE TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff') OR staff_user_id = auth.uid())
  WITH CHECK (is_super_admin() OR has_permission('manage_staff') OR staff_user_id = auth.uid());
CREATE POLICY "super admin delete documents" ON employee_documents FOR DELETE TO authenticated
  USING (is_super_admin());
