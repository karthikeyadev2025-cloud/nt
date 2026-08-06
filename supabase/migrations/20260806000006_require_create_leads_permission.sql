/*
  # Require create_leads permission to insert leads (2026-08-06)

  The bug
  ────────
  "staff create leads in own segments" (added 2026-07-27, migration
  20260727000010) checks segment access but never checks whether the
  staff member actually holds the create_leads permission. Combined with
  the frontend's "+Add Lead" button being shown to anyone with
  manage_leads (a separate, broader permission every lead-facing role
  has), this meant:

    - The UI showed "+Add Lead" to telecallers and managers, who were
      never meant to have it (create_leads is deliberately granted only
      to marketing_executive by default — see role_permissions seed
      data in the init migration).
    - Even without the button, any authenticated staff member — including
      a role with zero lead permissions — could INSERT into
      marketing_leads directly via the API, because the policy never
      checked has_permission('create_leads') at all. The frontend gate
      was the only thing stopping it, which is not real enforcement.

  This migration adds the missing has_permission('create_leads') check.
  The companion frontend fix (this same patch) changes the "+Add Lead"
  button to gate on create_leads instead of manage_leads, so the UI now
  matches what the database actually allows.
*/

DROP POLICY IF EXISTS "staff create leads in own segments" ON marketing_leads;
CREATE POLICY "staff create leads in own segments" ON marketing_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission('create_leads')
    AND (is_super_admin() OR can_access_segment(segment_slug))
    AND (
      assigned_to IS NULL
      OR staff_covers_segment(assigned_to, segment_slug)
    )
  );
