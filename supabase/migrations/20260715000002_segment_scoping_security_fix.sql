/*
  # Fix: cross-segment permission leak on staff-management tables.
  Every RLS policy on attendance/leaves/advances/documents/bank/photo/promotions/
  payslips/shifts checked has_permission() alone — company-wide, with no segment
  check. A CCTV-only manager granted 'approve_leaves' (a manager default) could
  see and approve Digital Media / Software staff's leave requests too.

  Fix: a new helper can_access_staff() checks segment overlap between the acting
  user and the target staff member — same 'all' bypass HR already relies on
  (segments=['all']), but a single-segment manager is now correctly confined to
  their own team. Nothing changes for super_admin or 'all'-segment roles.
*/

CREATE OR REPLACE FUNCTION can_access_staff(target_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT is_super_admin()
      OR 'all' = ANY(get_my_segments())
      OR target_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM app_users t
        WHERE t.id = target_id AND t.segments && get_my_segments()
      );
$$;

-- ═══════════════════════════════════════════════════════════════
-- app_users
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "read own profile" ON app_users;
CREATE POLICY "read own profile" ON app_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_super_admin() OR (has_permission('view_staff') AND can_access_staff(id)));

DROP POLICY IF EXISTS "super admin updates users" ON app_users;
CREATE POLICY "super admin updates users" ON app_users FOR UPDATE TO authenticated
  USING (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(id)) OR id = auth.uid())
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(id)) OR id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- attendance_records
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own attendance" ON attendance_records;
CREATE POLICY "own attendance" ON attendance_records FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR (has_permission('view_attendance') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- leave_requests
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own leaves" ON leave_requests;
CREATE POLICY "own leaves" ON leave_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR (has_permission('approve_leaves') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "approve leaves" ON leave_requests;
CREATE POLICY "approve leaves" ON leave_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
  WITH CHECK (has_permission('approve_leaves') AND can_access_staff(staff_user_id));

-- ═══════════════════════════════════════════════════════════════
-- salary_advance_requests
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own advances" ON salary_advance_requests;
CREATE POLICY "own advances" ON salary_advance_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR ((has_permission('approve_advances') OR has_permission('view_payroll')) AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr reviews advances" ON salary_advance_requests;
CREATE POLICY "hr reviews advances" ON salary_advance_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_advances') AND can_access_staff(staff_user_id))
  WITH CHECK (has_permission('approve_advances') AND can_access_staff(staff_user_id));

-- ═══════════════════════════════════════════════════════════════
-- employee_documents
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own documents" ON employee_documents;
CREATE POLICY "own documents" ON employee_documents FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR ((has_permission('manage_staff') OR has_permission('view_staff')) AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr issue documents" ON employee_documents;
CREATE POLICY "hr issue documents" ON employee_documents FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr update documents" ON employee_documents;
CREATE POLICY "hr update documents" ON employee_documents FOR UPDATE TO authenticated
  USING (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)) OR staff_user_id = auth.uid())
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)) OR staff_user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- bank_change_requests
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own bank requests" ON bank_change_requests;
CREATE POLICY "own bank requests" ON bank_change_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR ((has_permission('approve_advances') OR has_permission('view_payroll')) AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "review bank change" ON bank_change_requests;
CREATE POLICY "review bank change" ON bank_change_requests FOR UPDATE TO authenticated
  USING (is_super_admin() OR (has_permission('approve_advances') AND can_access_staff(staff_user_id)))
  WITH CHECK (is_super_admin() OR (has_permission('approve_advances') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- photo_change_requests
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own photo requests" ON photo_change_requests;
CREATE POLICY "own photo requests" ON photo_change_requests FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "review photo change" ON photo_change_requests;
CREATE POLICY "review photo change" ON photo_change_requests FOR UPDATE TO authenticated
  USING (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)))
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- promotions
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own promotions" ON promotions;
CREATE POLICY "own promotions" ON promotions FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR ((has_permission('view_staff') OR has_permission('manage_staff')) AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr create promotions" ON promotions;
CREATE POLICY "hr create promotions" ON promotions FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- payslips
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own payslips" ON payslips;
CREATE POLICY "own payslips" ON payslips FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR (has_permission('view_payroll') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr manage payslips" ON payslips;
CREATE POLICY "hr manage payslips" ON payslips FOR ALL TO authenticated
  USING (is_super_admin() OR (has_permission('manage_payroll') AND can_access_staff(staff_user_id)))
  WITH CHECK (is_super_admin() OR (has_permission('manage_payroll') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- salary_payments (inherits payslip's staff scope)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own salary payments" ON salary_payments;
CREATE POLICY "own salary payments" ON salary_payments FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR (has_permission('view_payroll') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "hr record payments" ON salary_payments;
CREATE POLICY "hr record payments" ON salary_payments FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (has_permission('manage_payroll') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- staff_shifts (per-person assignment — scope by the assigned staff member)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own shift assignment" ON staff_shifts;
CREATE POLICY "own shift assignment" ON staff_shifts FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR (has_permission('view_staff') AND can_access_staff(staff_user_id)));
DROP POLICY IF EXISTS "admin assign shifts" ON staff_shifts;
CREATE POLICY "admin assign shifts" ON staff_shifts FOR ALL TO authenticated
  USING (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)))
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND can_access_staff(staff_user_id)));

-- ═══════════════════════════════════════════════════════════════
-- shifts (definitions) — scope by the shift's own segment_slug (nullable = company-wide)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin manage shifts" ON shifts;
CREATE POLICY "admin manage shifts" ON shifts FOR ALL TO authenticated
  USING (is_super_admin() OR (has_permission('manage_staff') AND (segment_slug IS NULL OR can_access_segment(segment_slug))))
  WITH CHECK (is_super_admin() OR (has_permission('manage_staff') AND (segment_slug IS NULL OR can_access_segment(segment_slug))));

-- ═══════════════════════════════════════════════════════════════
-- job_postings — scope by segment_slug (nullable = company-wide role)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "hr manage jobs" ON job_postings;
CREATE POLICY "hr manage jobs" ON job_postings FOR ALL TO authenticated
  USING (is_super_admin() OR (has_permission('manage_careers') AND (segment_slug IS NULL OR can_access_segment(segment_slug))))
  WITH CHECK (is_super_admin() OR (has_permission('manage_careers') AND (segment_slug IS NULL OR can_access_segment(segment_slug))));

-- ═══════════════════════════════════════════════════════════════
-- career_applications — already has segment_slug; tighten to check it
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "hr read careers" ON career_applications;
CREATE POLICY "hr read careers" ON career_applications FOR SELECT TO authenticated
  USING (is_super_admin() OR ((has_permission('view_careers') OR has_permission('manage_careers')) AND (segment_slug IS NULL OR can_access_segment(segment_slug))));
DROP POLICY IF EXISTS "hr update careers" ON career_applications;
CREATE POLICY "hr update careers" ON career_applications FOR UPDATE TO authenticated
  USING (is_super_admin() OR (has_permission('manage_careers') AND (segment_slug IS NULL OR can_access_segment(segment_slug))))
  WITH CHECK (is_super_admin() OR (has_permission('manage_careers') AND (segment_slug IS NULL OR can_access_segment(segment_slug))));
