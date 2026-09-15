-- ═══════════════════════════════════════════════════════════════
-- Close the notification spoofing hole.
--
-- `notifications` has RLS enabled and its SELECT/UPDATE policies are
-- correctly scoped to `user_id = auth.uid()`. The INSERT policy was not:
--
--   CREATE POLICY "staff create notifications" ON notifications
--     FOR INSERT TO authenticated WITH CHECK (true);
--
-- Insert has to stay open to *some* degree, because staff legitimately
-- notify each other — assigning leads (shared.tsx, leads-workflow.tsx) and
-- assigning appointments both write a row addressed to someone else. But
-- `WITH CHECK (true)` meant ANY signed-in user could write ANY row to ANY
-- recipient, with a title, body and link of their choosing, and the table
-- has no sender column, so the message arrived anonymous and unattributable.
--
-- Two concrete abuses that needed nothing but a browser console:
--   • Impersonation — "Your leave has been approved" or "Payroll: action
--     required" delivered to the whole company from no one.
--   • Phishing with the app's own credibility — an arbitrary `link`
--     rendered inside the portal, which staff have every reason to trust.
--
-- This migration keeps staff-to-staff notification working and removes both
-- abuses:
--   1. `created_by` records who sent it, defaulting to auth.uid() so the
--      sender cannot be forged and existing call sites need no change.
--   2. `link` is restricted to same-origin relative paths, so a
--      notification can never point out of the app.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_users(id) ON DELETE SET NULL DEFAULT auth.uid();

COMMENT ON COLUMN notifications.created_by IS
  'Who sent this notification. Defaults to auth.uid() and is pinned by the INSERT policy, so it cannot be forged. NULL for rows written before this column existed, or by SECURITY DEFINER routines (notify_user, the meeting triggers) which run as the definer rather than as `authenticated`.';

DROP POLICY IF EXISTS "staff create notifications" ON notifications;

-- Also drop THIS migration's own policy first, so re-running the file is a
-- no-op instead of a failure. Without it a second run raised 42710
-- (duplicate_object) on the CREATE below and rolled the whole thing back —
-- alarming to read, and indistinguishable at a glance from the migration
-- never having worked.
--
-- Dropping both names matters for a reason beyond tidiness: Postgres ORs
-- permissive policies together, so if the old `WITH CHECK (true)` policy
-- ever coexisted with the strict one, the permissive one would win and the
-- spoofing hole would be wide open while looking fixed.
DROP POLICY IF EXISTS "staff create attributable notifications" ON notifications;

CREATE POLICY "staff create attributable notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Sender is always the caller. The column default supplies this when
    -- the client omits it (which every current call site does), so this
    -- pins attribution rather than adding a new required field.
    created_by = auth.uid()
    -- In-app destinations only. Every existing caller passes '' or
    -- '/portal'; this blocks 'https://evil.example' and 'javascript:'
    -- without constraining any real use.
    AND (link IS NULL OR link = '' OR link LIKE '/%')
  );
