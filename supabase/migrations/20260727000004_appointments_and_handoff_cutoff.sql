/*
  # Appointments + handoff visibility cutoff (2026-07-27)

  Two related changes to the telecaller → executive workflow.

  1. APPOINTMENTS. A telecaller can now book a dated/timed appointment on a
     lead (site visit, demo, meeting). This is distinct from callback_at,
     which is the telecaller's own reminder to call again — an appointment is
     a commitment made TO the customer that an executive will attend.

  2. HANDOFF VISIBILITY CUTOFF. Previously the lead SELECT policy included
     `created_by = auth.uid()`, so the telecaller who first touched a lead
     kept full visibility forever — including after a manager reassigned it to
     an executive. Verified: after reassignment the telecaller could still
     read the row. Restricted staff (no full_leads_view) now lose access the
     moment the lead leaves them; managers, HR and super admins retain the
     full picture.

     Lead creators who are NOT restricted staff are unaffected because they
     hold full_leads_view. A field executive who creates their own lead keeps
     it via assigned_to, not created_by.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Appointment fields
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS appointment_set_by uuid REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_appointment ON marketing_leads (appointment_at)
  WHERE appointment_at IS NOT NULL;

-- Notify the assigned executive (and the managers who can act on it) when an
-- appointment is booked or moved, so nobody misses a committed visit.
CREATE OR REPLACE FUNCTION tg_lead_appointment_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m record;
  when_txt text;
BEGIN
  IF NEW.appointment_at IS NULL
     OR NEW.appointment_at IS NOT DISTINCT FROM OLD.appointment_at THEN
    RETURN NEW;
  END IF;

  when_txt := to_char(NEW.appointment_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');

  -- The person who will attend, if the lead is already assigned to someone else.
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(NEW.appointment_set_by, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM notify_user(NEW.assigned_to, 'appointment',
      'Appointment booked: ' || NEW.customer_name,
      when_txt || COALESCE(' — ' || NULLIF(NEW.appointment_note, ''), ''), '/portal');
  END IF;

  -- Managers/HR in the lead's segment, so they can allocate an executive.
  FOR m IN
    SELECT id FROM app_users
    WHERE is_active AND role IN ('manager','hr','super_admin')
      AND ('all' = ANY(segments) OR NEW.segment_slug = ANY(segments))
  LOOP
    PERFORM notify_user(m.id, 'appointment',
      'Appointment booked: ' || NEW.customer_name,
      when_txt || ' (' || NEW.segment_slug || ')', '/admin');
  END LOOP;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_appointment_notify ON marketing_leads;
CREATE TRIGGER trg_lead_appointment_notify
  AFTER UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION tg_lead_appointment_notify();

-- ═══════════════════════════════════════════════════════════════
-- 2. Handoff visibility cutoff
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "staff view segment leads" ON marketing_leads;
CREATE POLICY "staff view segment leads" ON marketing_leads FOR SELECT TO authenticated
  USING (
    has_permission('view_leads') AND (
      -- Currently mine.
      assigned_to = auth.uid()
      -- Full-visibility staff (manager / HR / super admin) see the segment.
      OR (has_permission('full_leads_view') AND can_access_segment(segment_slug))
      -- Unclaimed pool, still workable.
      OR (assigned_to IS NULL AND stage NOT IN ('won','lost') AND can_access_segment(segment_slug))
    )
  );

-- Remarks follow lead visibility: once a lead is handed off, its call history
-- goes with it.
DROP POLICY IF EXISTS "staff view remarks" ON lead_remarks;
CREATE POLICY "staff view remarks" ON lead_remarks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM marketing_leads l WHERE l.id = lead_id AND has_permission('view_leads') AND (
      l.assigned_to = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(l.segment_slug))
      OR (l.assigned_to IS NULL AND l.stage NOT IN ('won','lost') AND can_access_segment(l.segment_slug))
    )
  ));

-- UPDATE mirrors SELECT: no editing a lead you can no longer see.
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
