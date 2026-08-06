/*
  # get_lead_remark_counts — batched follow-up count for lead cards (2026-08-06)

  Why
  ───
  The Aadya-style lead card redesign shows a "📞 N follow-ups" badge per
  card (count of lead_remarks rows for that lead). Fetching this with one
  query per visible lead would be N round trips for a list of up to 400
  leads. This RPC returns counts for a whole batch of lead ids in one call,
  grouped server-side, so the board can request everything it needs in a
  single query after loading the lead list.

  Security: STABLE, SECURITY INVOKER — relies on the caller's existing
  SELECT policy on lead_remarks (staff already can't read remarks for
  leads outside their access, so counts naturally respect the same
  boundary; nothing here escalates access).
*/

CREATE OR REPLACE FUNCTION public.get_lead_remark_counts(p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, remark_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lr.lead_id, count(*)::bigint AS remark_count
  FROM lead_remarks lr
  WHERE lr.lead_id = ANY(p_lead_ids)
  GROUP BY lr.lead_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_remark_counts(uuid[]) TO authenticated;
