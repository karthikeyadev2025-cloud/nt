/*
  # Scope lead creation to the creator's segments (2026-07-27)

  The INSERT policy on marketing_leads was WITH CHECK (true) — necessary for
  the public website form, which posts as `anon` with no session. But it also
  applied to `authenticated`, so any signed-in staff member could create a
  lead in ANY segment, and because the SELECT policy grants access to leads
  assigned to you, they could then read it.

  Reproduced: a digital_media telecaller inserted a lead with
  segment_slug='software' assigned to themselves and read it back — a
  cross-segment leak that bypassed all the SELECT scoping.

  Split the policy by role:
    anon          -> may submit website enquiries only (source='website',
                     unassigned). It cannot pick an owner or a source.
    authenticated -> may only create in segments they can access, and may
                     only assign to someone who can access that segment.

  Bulk upload is unaffected for the roles that should have it: super admin has
  'all', and a manager uploading into their own segment passes both checks.
*/

DROP POLICY IF EXISTS "public can submit lead" ON marketing_leads;

-- Website contact form: anonymous, unassigned, always source='website'.
CREATE POLICY "public can submit lead" ON marketing_leads FOR INSERT TO anon
  WITH CHECK (
    source = 'website'
    AND assigned_to IS NULL
    AND created_by IS NULL
  );

-- Helper: can this staff member work in this segment?
-- ('all' segments, or the segment is in their list.)
CREATE OR REPLACE FUNCTION staff_covers_segment(_user_id uuid, _segment_slug text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users u
    WHERE u.id = _user_id
      AND u.is_active
      AND ('all' = ANY(u.segments) OR _segment_slug = ANY(u.segments))
  );
$$;
GRANT EXECUTE ON FUNCTION staff_covers_segment(uuid, text) TO authenticated;

-- Staff: only in segments they can access, only assigned to someone who
-- covers that segment (or left unassigned for the pool).
CREATE POLICY "staff create leads in own segments" ON marketing_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_super_admin() OR can_access_segment(segment_slug))
    AND (
      assigned_to IS NULL
      OR staff_covers_segment(assigned_to, segment_slug)
    )
  );
