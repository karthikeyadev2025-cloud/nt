/*
  # Employment status: Suspend / Dismiss / Retire (2026-08-07)

  Until now app_users had only is_active (boolean) -- no distinction
  between "temporarily suspended," "dismissed," "retired," or the
  ordinary case of someone just being deactivated for some other
  reason. That made it unclear when to use the bare "Active" checkbox
  in Access Control, which in practice likely meant departed staff
  often just... stayed active, since there was no dedicated action
  that said "this person has left."

  employment_status is the new, clearer field. A trigger keeps
  is_active in sync automatically (false for anything except 'active'),
  so every existing is_active-based check -- has_permission(),
  is_super_admin(), and every assignment dropdown already filtering on
  is_active=true -- keeps working exactly as before with zero other
  code changes required for the filtering itself.

  Nothing is deleted here or anywhere in this feature. Name-hiding
  (built in the frontend, not the database) never touches the stored
  full_name -- it only changes what's *displayed* to viewers without
  manage_staff/super_admin, and HR/Admin always sees the real name for
  audit purposes. All historical leads, tickets, documents, and remarks
  stay attributed by user id exactly as before.
*/

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employment_status text
  NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'suspended', 'dismissed', 'retired'));

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employment_status_changed_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employment_status_changed_by uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- Backfill: anyone already marked is_active=false but still 'active' in
-- the new field gets classified as 'dismissed' (the safest generic
-- assumption for "already inactive, reason not recorded") rather than
-- silently reactivating them by leaving employment_status='active'.
UPDATE app_users SET employment_status = 'dismissed' WHERE is_active = false AND employment_status = 'active';

CREATE OR REPLACE FUNCTION tg_sync_is_active_from_employment_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
    NEW.is_active := (NEW.employment_status = 'active');
    NEW.employment_status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_is_active ON app_users;
CREATE TRIGGER trg_sync_is_active
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION tg_sync_is_active_from_employment_status();
