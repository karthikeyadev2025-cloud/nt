/*
  # Bug fix: document_templates was gated to is_super_admin() only, inconsistent
  # with everywhere else in the system where manage_staff covers onboarding-related
  # actions (issuing documents, creating employees, etc). HR should be able to
  # edit templates without needing the literal super_admin account.
*/
DROP POLICY IF EXISTS "super admin manage templates" ON document_templates;
CREATE POLICY "staff manage templates" ON document_templates FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff'))
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));
