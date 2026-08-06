/*
  # Fix missing SELECT/UPDATE policies on leave_requests and salary_advance_requests
  (2026-08-06)

  ## The bug
  Both tables had RLS enabled with only an INSERT policy defined
  ("request leave" / "request advance"). Postgres RLS denies any operation
  with no matching policy by default, for every role including super admin
  sessions going through the normal authenticated path (SQL Editor queries
  bypass RLS via a privileged role, which is why the data "existed" but was
  invisible in the app). Net effect: every leave request and every salary
  advance request ever submitted was invisible to everyone, including
  approvers, and could never be approved or rejected through the app.

  ## This migration
  Records as a permanent migration the two CREATE POLICY pairs that were
  already applied live via the Supabase SQL Editor on 2026-08-06 to unblock
  production immediately. Written idempotently (DROP ... IF EXISTS then
  CREATE) so it is safe to run on a database that already has these policies
  live, and safe to run on a fresh database rebuilt from migrations alone.

  ## Follow-up covered separately
  Duplicate-leave-submission guard is added in
  20260806000003_duplicate_leave_submission_guard.sql
*/

-- ═══════════════════════════════════════════════════════════════
-- leave_requests: SELECT + UPDATE
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "view own or approvable leave requests" ON leave_requests;
CREATE POLICY "view own or approvable leave requests" ON leave_requests
FOR SELECT TO authenticated
USING (
  staff_user_id = auth.uid()
  OR (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
);

DROP POLICY IF EXISTS "approve or reject leave requests" ON leave_requests;
CREATE POLICY "approve or reject leave requests" ON leave_requests
FOR UPDATE TO authenticated
USING (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
WITH CHECK (has_permission('approve_leaves') AND can_access_staff(staff_user_id));

-- ═══════════════════════════════════════════════════════════════
-- salary_advance_requests: SELECT + UPDATE
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "view own or approvable advance requests" ON salary_advance_requests;
CREATE POLICY "view own or approvable advance requests" ON salary_advance_requests
FOR SELECT TO authenticated
USING (
  staff_user_id = auth.uid()
  OR (has_permission('approve_advances') AND can_access_staff(staff_user_id))
);

DROP POLICY IF EXISTS "approve or reject advance requests" ON salary_advance_requests;
CREATE POLICY "approve or reject advance requests" ON salary_advance_requests
FOR UPDATE TO authenticated
USING (has_permission('approve_advances') AND can_access_staff(staff_user_id))
WITH CHECK (has_permission('approve_advances') AND can_access_staff(staff_user_id));
