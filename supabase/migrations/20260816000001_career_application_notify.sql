/*
  # Notify careers staff when an application is submitted

  Problem this fixes
  ------------------
  Nothing anywhere signalled that a job application had arrived. Leads insert
  a notification, tickets insert a notification, shift swaps insert a
  notification — career_applications did not. The only way anyone learned an
  application existed was to remember to open Careers → Applications and
  look. That is the whole of the reported "job submitting not visible in
  super admin": the row was being written correctly, but nobody was told.

  Why a trigger and not client code
  ---------------------------------
  The apply form on the public site runs ANONYMOUSLY. The notifications table
  is `FOR INSERT TO authenticated`, and anon cannot read app_users to work out
  who should be notified. A client-side insert would therefore fail for every
  real applicant while appearing to work when tested by a signed-in admin —
  the worst kind of bug. SECURITY DEFINER on the trigger is what lets the
  anonymous insert fan out to the right staff.
*/

CREATE OR REPLACE FUNCTION notify_careers_staff_of_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient record;
  job_title text;
  role_names text[];
BEGIN
  SELECT title INTO job_title FROM job_postings WHERE id = NEW.job_posting_id;

  -- Roles whose role_permissions grant either careers permission. Collected
  -- once rather than per-user so this stays a single index-friendly scan.
  SELECT array_agg(role_name) INTO role_names
  FROM role_permissions
  WHERE (permissions ->> 'view_careers')::boolean IS TRUE
     OR (permissions ->> 'manage_careers')::boolean IS TRUE;

  FOR recipient IN
    SELECT u.id
    FROM app_users u
    WHERE u.is_active
      AND (
        u.role = 'super_admin'
        OR u.role = ANY(COALESCE(role_names, ARRAY[]::text[]))
        -- Per-user overrides win over the role default, exactly as
        -- has_permission() resolves them, so someone granted careers access
        -- individually is notified and someone revoked individually is not.
        OR (u.permission_overrides ->> 'view_careers')::boolean IS TRUE
        OR (u.permission_overrides ->> 'manage_careers')::boolean IS TRUE
      )
      AND COALESCE((u.permission_overrides ->> 'view_careers') <> 'false', TRUE)
      -- Respect segment scoping: an application tagged to a segment only
      -- notifies people who could actually open it under the RLS SELECT
      -- policy. Notifying someone about a record they then can't read is
      -- worse than not notifying them.
      AND (
        NEW.segment_slug IS NULL
        OR u.role = 'super_admin'
        OR 'all' = ANY(u.segments)
        OR NEW.segment_slug = ANY(u.segments)
      )
  LOOP
    PERFORM notify_user(
      recipient.id,
      'career_application',
      'New job application: ' || NEW.name,
      COALESCE(job_title, NULLIF(NEW.position, ''), 'General application')
        || CASE WHEN NEW.phone IS NOT NULL THEN ' — ' || NEW.phone ELSE '' END,
      '/admin?tab=careers'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_notify_career_application ON career_applications;
CREATE TRIGGER tg_notify_career_application
  AFTER INSERT ON career_applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_careers_staff_of_application();

-- ═══════════════════════════════════════════════════════════════
-- Backfill: grant view_careers to roles that can already reach the
-- Careers tab in the dashboard.
--
-- The original careers migration granted view_careers/manage_careers to the
-- 'hr' role only. But SuperAdminDashboard shows the Careers tab to anyone
-- holding EITHER permission, and several deployments have admin/manager
-- users who were given manage_careers by hand without view_careers. The
-- RLS SELECT policy checks for either, so those users could open the tab —
-- and, if their grant came through a per-user override that the role lacks,
-- read nothing and see an empty list with no explanation. Keeping the two
-- permissions consistent at the role level removes that whole class of
-- "the tab is there but it's empty" confusion.
-- ═══════════════════════════════════════════════════════════════
UPDATE role_permissions
SET permissions = permissions || '{"view_careers": true}'::jsonb
WHERE (permissions ->> 'manage_careers')::boolean IS TRUE
  AND COALESCE((permissions ->> 'view_careers')::boolean, false) IS NOT TRUE;

-- ═══════════════════════════════════════════════════════════════
-- Index: the applications list orders by created_at DESC on every open,
-- and now also filters by status for the "new" badge count.
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_career_applications_created
  ON career_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_applications_status
  ON career_applications(status, created_at DESC);
