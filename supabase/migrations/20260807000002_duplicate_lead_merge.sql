/*
  # Duplicate lead merge tool (2026-08-07)

  find_duplicate_leads/lead_phone_exists already stop a NEW duplicate at
  creation time, but do nothing about leads that already exist twice —
  from before that check existed, from two staff members entering the
  same enquiry independently, or from a bulk upload overlapping the
  existing book. Nothing let anyone actually fix that once it happened.

  Scoped to same phone + same segment only. A customer legitimately
  enquiring about two different segments (e.g. CCTV and software) is
  not a duplicate and must never be merge-eligible — that's the same
  scoping find_duplicate_leads already uses.

  Merging is a SECURITY DEFINER RPC rather than relying on the
  marketing_leads DELETE policy, which is is_super_admin()-only — that
  would leave managers unable to use this at all. bulk_assign_leads is
  the permission already used for other data-hygiene bulk operations
  (Bulk Reassign), so it's reused here rather than inventing a new one.
*/

CREATE OR REPLACE FUNCTION find_duplicate_lead_groups()
RETURNS TABLE (
  segment_slug text, phone text, id uuid, customer_name text, stage text,
  assigned_to uuid, assignee_name text, remark_count bigint, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT l.segment_slug, l.phone, l.id, l.customer_name, l.stage,
         l.assigned_to, u.full_name,
         (SELECT count(*) FROM lead_remarks r WHERE r.lead_id = l.id),
         l.created_at
  FROM marketing_leads l
  LEFT JOIN app_users u ON u.id = l.assigned_to
  WHERE has_permission('full_leads_view')
    AND l.phone IS NOT NULL AND l.phone <> '' AND l.phone <> 'Pending Collection'
    AND EXISTS (
      SELECT 1 FROM marketing_leads d
      WHERE d.phone = l.phone AND d.segment_slug = l.segment_slug AND d.id <> l.id
    )
  ORDER BY l.segment_slug, l.phone, l.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION find_duplicate_lead_groups() TO authenticated;

CREATE OR REPLACE FUNCTION merge_leads(p_keep_id uuid, p_merge_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_keep marketing_leads;
  v_merge marketing_leads;
  v_names text[] := '{}';
BEGIN
  IF NOT (has_permission('bulk_assign_leads') OR is_super_admin()) THEN
    RAISE EXCEPTION 'You do not have permission to merge leads.';
  END IF;

  SELECT * INTO v_keep FROM marketing_leads WHERE id = p_keep_id;
  IF v_keep IS NULL THEN
    RAISE EXCEPTION 'Lead to keep not found.';
  END IF;

  FOR v_merge IN SELECT * FROM marketing_leads WHERE id = ANY(p_merge_ids) LOOP
    IF v_merge.phone <> v_keep.phone OR v_merge.segment_slug <> v_keep.segment_slug THEN
      RAISE EXCEPTION 'Refusing to merge % — different phone or segment than the lead being kept.', v_merge.customer_name;
    END IF;
    v_names := array_append(v_names, v_merge.customer_name);
  END LOOP;

  -- History moves with the merge — nothing about what was said or done
  -- on the merged-away leads is lost, it all lands on the kept lead.
  UPDATE lead_remarks SET lead_id = p_keep_id WHERE lead_id = ANY(p_merge_ids);

  -- Backfill blanks on the kept lead from whichever merged lead has data,
  -- rather than silently dropping whatever was only recorded on the ones
  -- being removed.
  UPDATE marketing_leads SET
    email = COALESCE(NULLIF(email, ''), (SELECT NULLIF(email, '') FROM marketing_leads WHERE id = ANY(p_merge_ids) AND NULLIF(email, '') IS NOT NULL LIMIT 1)),
    interested_in = COALESCE(NULLIF(interested_in, ''), (SELECT NULLIF(interested_in, '') FROM marketing_leads WHERE id = ANY(p_merge_ids) AND NULLIF(interested_in, '') IS NOT NULL LIMIT 1)),
    address = COALESCE(NULLIF(address, ''), (SELECT NULLIF(address, '') FROM marketing_leads WHERE id = ANY(p_merge_ids) AND NULLIF(address, '') IS NOT NULL LIMIT 1)),
    alternate_phone = COALESCE(NULLIF(alternate_phone, ''), (SELECT NULLIF(alternate_phone, '') FROM marketing_leads WHERE id = ANY(p_merge_ids) AND NULLIF(alternate_phone, '') IS NOT NULL LIMIT 1)),
    latitude = COALESCE(latitude, (SELECT latitude FROM marketing_leads WHERE id = ANY(p_merge_ids) AND latitude IS NOT NULL LIMIT 1)),
    longitude = COALESCE(longitude, (SELECT longitude FROM marketing_leads WHERE id = ANY(p_merge_ids) AND longitude IS NOT NULL LIMIT 1))
  WHERE id = p_keep_id;

  INSERT INTO lead_remarks (lead_id, user_id, call_type, remark)
  VALUES (p_keep_id, auth.uid(), 'note', 'Merged duplicate lead(s): ' || array_to_string(v_names, ', '));

  DELETE FROM marketing_leads WHERE id = ANY(p_merge_ids);
END;
$$;
GRANT EXECUTE ON FUNCTION merge_leads(uuid, uuid[]) TO authenticated;
