/*
  # Fix: "only assigned follow-ups visible" was a frontend-only restriction.
  Telecallers and Marketing Executives (full_leads_view = false) were shown a
  restricted queue UI, but the database itself still let them read every lead
  in their segment via has_permission('view_leads') + can_access_segment() —
  bypassable by calling the Supabase client directly. Now the database enforces
  it for real: without full_leads_view, you only ever see leads assigned to you
  or created by you. Managers/HR (full_leads_view = true) are unaffected — they
  keep full segment visibility as intended.
*/

DROP POLICY IF EXISTS "staff view segment leads" ON marketing_leads;
CREATE POLICY "staff view segment leads" ON marketing_leads FOR SELECT TO authenticated
  USING (
    has_permission('view_leads') AND (
      assigned_to = auth.uid() OR created_by = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(segment_slug))
    )
  );

DROP POLICY IF EXISTS "staff update segment leads" ON marketing_leads;
CREATE POLICY "staff update segment leads" ON marketing_leads FOR UPDATE TO authenticated
  USING (
    has_permission('manage_leads') AND (
      assigned_to = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(segment_slug))
    )
  )
  WITH CHECK (has_permission('manage_leads'));

-- Same fix applies to remarks/visit notes attached to those leads — a
-- restricted-view telecaller should only read notes on her own leads, not
-- every note across the segment.
DROP POLICY IF EXISTS "staff view remarks" ON lead_remarks;
CREATE POLICY "staff view remarks" ON lead_remarks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM marketing_leads l WHERE l.id = lead_id AND has_permission('view_leads') AND (
      l.assigned_to = auth.uid() OR l.created_by = auth.uid()
      OR (has_permission('full_leads_view') AND can_access_segment(l.segment_slug))
    )
  ));
