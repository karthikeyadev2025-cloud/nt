/*
  # Telecaller Workflow: call queue, callback retention, executive handoff approval
  - marketing_leads: callback_at, transfer approval columns
  - New permission: full_leads_view (full CRM board vs counts-only call queue),
    bulk_assign_leads (Excel upload + bulk assign), approve_transfers (manager/admin)
  - Trigger: notifies manager/admin on transfer request, notifies telecaller/executive on resolution
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Lead workflow columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS callback_at timestamptz;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS pending_transfer_to uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS transfer_requested_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS transfer_status text NOT NULL DEFAULT 'none'
  CHECK (transfer_status IN ('none','pending','approved','rejected'));
ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS transfer_note text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_leads_assigned_active ON marketing_leads(assigned_to, transfer_status);

-- ═══════════════════════════════════════════════════════════════
-- 2. New permissions
-- ═══════════════════════════════════════════════════════════════
-- full_leads_view: sees the full CRM board (all leads/filters). Off = counts-only dashboard + own call queue.
-- bulk_assign_leads: can Excel-upload leads and bulk-assign to telecallers.
-- approve_transfers: can approve/reject telecaller → executive handoff requests.
UPDATE role_permissions SET permissions = permissions || '{"full_leads_view": true, "bulk_assign_leads": true, "approve_transfers": true}'::jsonb
WHERE role_name = 'manager';
UPDATE role_permissions SET permissions = permissions || '{"full_leads_view": true, "bulk_assign_leads": true, "approve_transfers": true}'::jsonb
WHERE role_name = 'hr';
UPDATE role_permissions SET permissions = permissions || '{"full_leads_view": false}'::jsonb
WHERE role_name = 'telecaller';
UPDATE role_permissions SET permissions = permissions || '{"full_leads_view": true}'::jsonb
WHERE role_name = 'marketing_executive';

-- Telecallers can request a transfer (handled at app level via manage_leads); executives receive approved leads.

-- ═══════════════════════════════════════════════════════════════
-- 3. Transfer request/resolution notifications
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION tg_lead_transfer_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE approver record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.transfer_status = 'none' AND NEW.transfer_status = 'pending' THEN
    FOR approver IN
      SELECT id FROM app_users
      WHERE is_active AND (
        (permission_overrides ->> 'approve_transfers')::boolean = true
        OR (role IN ('manager','hr','super_admin') AND (permission_overrides ->> 'approve_transfers') IS NULL)
      )
      AND (NEW.segment_slug = ANY(segments) OR 'all' = ANY(segments) OR role = 'super_admin')
    LOOP
      PERFORM notify_user(approver.id, 'lead_transfer', 'Lead handoff needs approval', NEW.customer_name || ' — requested transfer to executive', '/portal');
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.transfer_status = 'pending' AND NEW.transfer_status = 'approved' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM notify_user(NEW.assigned_to, 'lead_transfer', 'Lead assigned to you', NEW.customer_name || ' has been handed to you for visit/closure.', '/portal');
    END IF;
    IF NEW.transfer_requested_by IS NOT NULL THEN
      PERFORM notify_user(NEW.transfer_requested_by, 'lead_transfer', 'Transfer approved', 'Your handoff for ' || NEW.customer_name || ' was approved.', '/portal');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.transfer_status = 'pending' AND NEW.transfer_status = 'rejected' THEN
    IF NEW.transfer_requested_by IS NOT NULL THEN
      PERFORM notify_user(NEW.transfer_requested_by, 'lead_transfer', 'Transfer rejected', 'Your handoff for ' || NEW.customer_name || ' was rejected.', '/portal');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_transfer_notify ON marketing_leads;
CREATE TRIGGER trg_lead_transfer_notify AFTER UPDATE ON marketing_leads FOR EACH ROW EXECUTE FUNCTION tg_lead_transfer_notify();
