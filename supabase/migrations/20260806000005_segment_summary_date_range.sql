/*
  # get_segment_summary — optional date range (2026-08-06)

  Adds p_from/p_to timestamptz params (both default NULL) so the Overview
  page's new date-range filter (Today / 7d / 30d / This month / All time)
  can scope ticket and lead counts to a window instead of always showing
  all-time totals. NULL on either side means "no bound on that side" —
  calling with no args at all reproduces the exact old all-time behavior,
  so this is backward compatible with any caller still doing
  `supabase.rpc('get_segment_summary')`.

  Staff counts are a headcount snapshot, not a historical metric, so they
  are deliberately NOT date-filtered — "3 staff" should mean "3 staff
  right now" regardless of what date range is selected.

  IMPORTANT: the old get_segment_summary() (zero-arg) function is dropped
  first. Postgres treats different parameter lists as different
  overloads, and since every param below has a DEFAULT, calling
  get_segment_summary() with no arguments would otherwise be ambiguous
  between the old zero-arg function and this one — "function is not
  unique" at call time.
*/

DROP FUNCTION IF EXISTS get_segment_summary();

CREATE OR REPLACE FUNCTION get_segment_summary(p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH ticket_counts AS (
    SELECT segment_slug,
           count(*) AS tickets,
           count(*) FILTER (WHERE status IN ('open', 'in_progress')) AS open_tickets
    FROM support_tickets
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at <= p_to)
    GROUP BY segment_slug
  ),
  lead_counts AS (
    SELECT segment_slug,
           count(*) AS leads,
           count(*) FILTER (WHERE stage = 'won') AS won
    FROM marketing_leads
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at <= p_to)
    GROUP BY segment_slug
  ),
  staff_counts AS (
    SELECT unnest(segments) AS segment_slug, count(*) AS staff
    FROM app_users
    WHERE is_active = true
    GROUP BY unnest(segments)
  ),
  all_segments AS (
    SELECT slug FROM segments
  )
  SELECT jsonb_object_agg(
    s.slug,
    jsonb_build_object(
      'tickets', coalesce(tc.tickets, 0),
      'openTickets', coalesce(tc.open_tickets, 0),
      'leads', coalesce(lc.leads, 0),
      'won', coalesce(lc.won, 0),
      'staff', coalesce(sc.staff, 0)
    )
  )
  INTO v_result
  FROM all_segments s
  LEFT JOIN ticket_counts tc ON tc.segment_slug = s.slug
  LEFT JOIN lead_counts lc ON lc.segment_slug = s.slug
  LEFT JOIN staff_counts sc ON sc.segment_slug = s.slug;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_segment_summary(timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
