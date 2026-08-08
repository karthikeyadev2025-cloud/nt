/*
  # Lead change approval workflow (2026-08-07)

  Manager already has full read/work access to leads (view everything,
  change stages, log outcomes, reschedule, assign) -- that's unchanged.
  What's new: editing a lead's core details (via the Edit Lead form) or
  deleting one now goes through Super Admin approval for anyone who
  isn't super_admin, instead of applying instantly.

  Note on what this doesn't touch: routine workflow actions -- stage
  changes (one-click buttons, Kanban drag), Log Outcome, Reschedule,
  adding remarks -- are not "editing a lead" in the sense meant here,
  and stay direct. This is specifically about the Edit Lead form
  (changing name/phone/segment/assignment/etc.) and deletion.

  Nothing about existing RLS on marketing_leads changes. Delete was
  already is_super_admin()-only at the database level (see the original
  "super admin deletes leads" policy) -- a manager's Delete button was
  already being silently blocked by RLS before this, just with a
  confusing UX (the button existed but did nothing). This gives that a
  real, visible request-and-approve flow instead.

  lead_id uses ON DELETE SET NULL, not CASCADE -- if a delete request is
  approved and the lead is gone, the request stays as a historical
  record (with original_data as a snapshot of what the lead was) rather
  than vanishing along with it.
*/

CREATE TABLE IF NOT EXISTS lead_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES marketing_leads(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('edit', 'delete')),
  proposed_data jsonb,
  original_data jsonb NOT NULL,
  requested_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_change_requests_status ON lead_change_requests(status) WHERE status = 'pending';

ALTER TABLE lead_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view own requests or admin views all" ON lead_change_requests;
CREATE POLICY "view own requests or admin views all" ON lead_change_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "manage_leads staff can request changes" ON lead_change_requests;
CREATE POLICY "manage_leads staff can request changes" ON lead_change_requests FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_leads') AND requested_by = auth.uid());

-- Only the approval RPC (SECURITY DEFINER, below) actually resolves a
-- request, but it still runs as the calling user for RLS purposes on
-- its own writes -- this policy is what lets that RPC's UPDATE through
-- when the caller is super_admin.
DROP POLICY IF EXISTS "super admin resolves requests" ON lead_change_requests;
CREATE POLICY "super admin resolves requests" ON lead_change_requests FOR UPDATE TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE OR REPLACE FUNCTION approve_lead_change_request(p_request_id uuid, p_approve boolean, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  req lead_change_requests;
  v_lead_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can approve or reject lead change requests.';
  END IF;

  SELECT * INTO req FROM lead_change_requests WHERE id = p_request_id;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found.';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been resolved.';
  END IF;
  v_lead_id := req.lead_id;

  IF p_approve THEN
    IF req.action = 'delete' THEN
      IF v_lead_id IS NOT NULL THEN
        DELETE FROM marketing_leads WHERE id = v_lead_id;
      END IF;
    ELSIF req.action = 'edit' THEN
      IF v_lead_id IS NOT NULL AND req.proposed_data IS NOT NULL THEN
        UPDATE marketing_leads SET
          customer_name = COALESCE(req.proposed_data->>'customer_name', customer_name),
          phone = COALESCE(req.proposed_data->>'phone', phone),
          email = req.proposed_data->>'email',
          segment_slug = COALESCE(req.proposed_data->>'segment_slug', segment_slug),
          interested_in = req.proposed_data->>'interested_in',
          address = req.proposed_data->>'address',
          stage = COALESCE(req.proposed_data->>'stage', stage),
          priority = COALESCE(req.proposed_data->>'priority', priority),
          assigned_to = NULLIF(req.proposed_data->>'assigned_to', '')::uuid,
          invoice_no = req.proposed_data->>'invoice_no',
          invoice_amount = NULLIF(req.proposed_data->>'invoice_amount', '')::numeric,
          updated_at = now()
        WHERE id = v_lead_id;
      END IF;
    END IF;
  END IF;

  UPDATE lead_change_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_lead_change_request(uuid, boolean, text) TO authenticated;
