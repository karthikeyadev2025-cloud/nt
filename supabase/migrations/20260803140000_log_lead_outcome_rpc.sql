/*
  # log_lead_outcome — atomic "record what happened" for staff (2026-08-03)

  Why
  ───
  Today a telecaller or field executive who works a lead has to make 3-4
  separate UI changes to record a single interaction: change stage in one
  dropdown, type a remark in a different box, set next-followup in the
  edit dialog, hope everything saved. This creates half-updated records
  ("stage set to qualified but no note explaining why") and confusion
  about whether the click did anything.

  Fix: one RPC that takes the outcome description and does all three
  writes atomically — stage change on marketing_leads, remark row on
  lead_remarks with the derived call_type, and the next follow-up
  timestamp. All or nothing.

  Security
  ────────
  SECURITY DEFINER because we combine multiple table writes that each
  have their own RLS policies — the function itself gates on the caller
  being either the lead's owner (assigned_to) or a manage_leads holder
  with segment access. Any other caller gets a raised exception.

  Callers
  ───────
  Called from the "Log Outcome" button in LeadsBoard. Nothing else uses it
  yet. Old code paths (direct .update() on stage) still work — this is
  additive.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.log_lead_outcome(
  p_lead_id uuid,
  p_new_stage text,
  p_call_type text,
  p_remark text,
  p_next_followup_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lead public.marketing_leads%ROWTYPE;
  v_old_stage text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_lead FROM public.marketing_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller must own the lead OR have manage_leads on segment.
  IF NOT (
    v_lead.assigned_to = v_uid
    OR (public.has_permission('manage_leads') AND public.can_access_segment(v_lead.segment_slug))
  ) THEN
    RAISE EXCEPTION 'Not authorized to log outcome on this lead' USING ERRCODE = '42501';
  END IF;

  -- Validate stage against the enum-like CHECK constraint values.
  IF p_new_stage NOT IN ('new','contacted','qualified','quoted','won','lost','not_answered') THEN
    RAISE EXCEPTION 'Invalid stage: %', p_new_stage USING ERRCODE = '22023';
  END IF;

  -- Validate call_type against the current allowed set.
  IF p_call_type NOT IN ('outgoing','incoming','visit','whatsapp','email','note') THEN
    RAISE EXCEPTION 'Invalid call_type: %', p_call_type USING ERRCODE = '22023';
  END IF;

  IF p_remark IS NULL OR btrim(p_remark) = '' THEN
    RAISE EXCEPTION 'Remark is required — record what happened.' USING ERRCODE = '23514';
  END IF;

  v_old_stage := v_lead.stage;

  -- 1. Stage + follow-up in one update.
  UPDATE public.marketing_leads
    SET stage = p_new_stage,
        next_followup_at = p_next_followup_at,
        updated_at = now()
    WHERE id = p_lead_id;

  -- 2. Remark, with the call type the outcome maps to.
  INSERT INTO public.lead_remarks (lead_id, user_id, call_type, remark)
    VALUES (p_lead_id, v_uid, p_call_type, p_remark);

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'old_stage', v_old_stage,
    'new_stage', p_new_stage,
    'next_followup_at', p_next_followup_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_lead_outcome(uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION