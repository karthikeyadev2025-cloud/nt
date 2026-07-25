/*
  # Fix: salary leaked to segment managers via offer letters

  Found by executing real queries as a CCTV manager against seeded data.

  The payroll design deliberately blocks segment managers from salary data:
  `payslips` requires view_payroll, which managers do not hold by default.
  Verified: a manager correctly sees 0 payslips.

  But `employee_documents` only required view_staff (which managers DO hold),
  and offer letters are generated from a template containing {{ctc}}. So a
  manager who cannot see a payslip could read the exact same salary figure
  from the offer letter — "CTC 3.6L" was readable in testing.

  Fix: gate compensation-bearing document types (offer_letter) behind the same
  view_payroll permission that guards payslips. Non-compensation documents
  (welcome letter, roles & responsibilities, job description, policy) stay
  readable by managers with view_staff, since those are genuinely useful for
  managing a team and carry no salary data.
*/

DROP POLICY IF EXISTS "own documents" ON employee_documents;
CREATE POLICY "own documents" ON employee_documents FOR SELECT TO authenticated
  USING (
    staff_user_id = auth.uid()
    OR is_super_admin()
    OR (
      can_access_staff(staff_user_id)
      AND (
        -- Compensation-bearing documents follow payroll access, matching payslips.
        CASE WHEN doc_type = 'offer_letter'
             THEN has_permission('view_payroll') OR has_permission('manage_payroll')
             ELSE has_permission('manage_staff') OR has_permission('view_staff')
        END
      )
    )
  );
