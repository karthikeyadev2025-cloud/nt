/*
  # Workflow-gap fixes from role-by-role lifecycle trace (2026-07-25)

  1. Segment-scope leave & advance approvals. Every other approval flow
     (staff edits, lead views) is segment-scoped via can_access_staff(), but
     leave_requests / salary_advance_requests skipped it — a CCTV manager could
     approve a Software employee's leave. SELECT (for reviewers) and UPDATE are
     both scoped now; employees still always see their own.

  2. Unassigned-pool self-claim for restricted staff. Telecallers and field
     executives cold-start with an empty queue and no way to fill it. They can
     now SEE unassigned leads in their segment and CLAIM them (set assigned_to
     to themselves). Claiming only works on unassigned leads — they still can't
     touch anyone else's.

  3. must_change_password: set for accounts created (or reset) by an admin so
     the temp password can't live forever. Cleared by the client after the
     employee sets their own.

  4. Notify managers/HR when a telecaller or marketing executive is onboarded —
     they need leads routed to them before they can do anything, and previously
     nothing signalled that.

  5. Drop the orphaned app_users.monthly_salary column (superseded by the
     salary_structure jsonb; nothing reads or writes it).
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Segment-scope leave & advance approvals
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "own leaves" ON leave_requests;
CREATE POLICY "own leaves" ON leave_requests FOR SELECT TO authenticated
  USING (
    staff_user_id = auth.uid()
    OR (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
  );

DROP POLICY IF EXISTS "approve leaves" ON leave_requests;
CREATE POLICY "approve leaves" ON leave_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_leaves') AND can_access_staff(staff_user_id))
  WITH CHECK (has_permission('approve_leaves') AND can_access_staff(staff_user_id));

DROP POLICY IF EXISTS "own advances" ON salary_advance_requests;
CREATE POLICY "own advances" ON salary_advance_requests FOR SELECT TO authenticated
  USING (
    staff_user_id = auth.uid()
    OR ((has_permission('approve_advances') OR has_permission('view_payroll')) AND can_access_staff(staff_user_id))
  );

DROP POLICY IF EXISTS "hr reviews advances" ON salary_advance_requests;
CREATE POLICY "hr reviews advances" ON salary_advance_requests FOR UPDATE TO authenticated
  USING (has_permission('approve_advances') AND can_access_staff(staff_user_id))
  WITH CHECK (has_permission('approve_advances') AND can_access_staff(staff_user_id));

-- ═══════════════════════════════════════════════════════════════
-- 2. Unassigned-pool visibility + self-claim for restricted staff
-- ═══════════════════════════════════════════════════════════════
-- SELECT: restricted staff (no full_leads_view) may additionally see leads
-- that are unassigned, active, and in a segment they can access.
DROP POLICY IF EXISTS "staff view segment leads" ON marketing_leads;
CREATE POLICY "staff view segment leads" ON marketing_leads FOR SELECT TO authenticated
  USING (
    has_permission('view_leads') AND (
      assigned_to = auth.uid() OR created_by = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(segment_slug))
      OR (assigned_to IS NULL AND stage NOT IN ('won','lost') AND can_access_segment(segment_slug))
    )
  );

-- UPDATE: restricted staff may also update an UNASSIGNED lead in their segment
-- (which is what claiming is). WITH CHECK stays manage_leads, so post-claim the
-- row must still satisfy the policy — it will, since they set assigned_to=self.
DROP POLICY IF EXISTS "staff update segment leads" ON marketing_leads;
CREATE POLICY "staff update segment leads" ON marketing_leads FOR UPDATE TO authenticated
  USING (
    has_permission('manage_leads') AND (
      assigned_to = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(segment_slug))
      OR (assigned_to IS NULL AND can_access_segment(segment_slug))
    )
  )
  WITH CHECK (has_permission('manage_leads'));

-- Remarks visibility follows lead visibility (keep in sync with SELECT above).
DROP POLICY IF EXISTS "staff view remarks" ON lead_remarks;
CREATE POLICY "staff view remarks" ON lead_remarks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM marketing_leads l WHERE l.id = lead_id AND has_permission('view_leads') AND (
      l.assigned_to = auth.uid() OR l.created_by = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(l.segment_slug))
      OR (l.assigned_to IS NULL AND l.stage NOT IN ('won','lost') AND can_access_segment(l.segment_slug))
    )
  ));

-- ═══════════════════════════════════════════════════════════════
-- 3. Forced password change after admin-set credentials
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- The privileged-column guard trigger must allow a user to clear their OWN
-- flag (that's the whole point) — it is not in the guarded list, so no change
-- needed there; documented for clarity.

-- ═══════════════════════════════════════════════════════════════
-- 4. Notify managers/HR when a lead-worker is onboarded
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tg_new_lead_worker_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m record;
BEGIN
  IF NEW.role IN ('telecaller','marketing_executive') THEN
    FOR m IN
      SELECT id FROM app_users
      WHERE is_active AND role IN ('manager','hr','super_admin')
        AND (segments && NEW.segments OR 'all' = ANY(segments) OR 'all' = ANY(NEW.segments))
    LOOP
      PERFORM notify_user(
        m.id, 'staff_onboarded',
        'New ' || REPLACE(NEW.role, '_', ' ') || ' onboarded',
        NEW.full_name || ' has joined and needs leads assigned to start working. Use Bulk Upload or Reassign Leads.',
        '/admin'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_new_lead_worker_notify ON app_users;
CREATE TRIGGER trg_new_lead_worker_notify AFTER INSERT ON app_users
  FOR EACH ROW EXECUTE FUNCTION tg_new_lead_worker_notify();

-- ═══════════════════════════════════════════════════════════════
-- 5. Drop the orphaned salary column
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users DROP COLUMN IF EXISTS monthly_salary;
