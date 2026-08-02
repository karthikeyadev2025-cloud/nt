/*
  # Consolidate segment-summary-card queries into one round trip

  Found by live-testing the actual deployed site: the Overview page's segment
  summary cards ("Digital Media: N tickets, N leads...") fired 4 separate
  queries PER segment (tickets, open tickets, leads, won leads) plus one more
  for staff counts — 9 total requests for today's 2 segments, scaling up
  automatically as more segments are added. Combined with the two widgets
  consolidated in the previous migration, this was a real, meaningful chunk
  of the ~40+ simultaneous requests measured in the Chrome performance trace.

  Deliberately NOT SECURITY DEFINER — must run with the caller's own
  permissions so RLS keeps scoping results exactly as the original 9
  separate queries did.

  Uses GROUP BY so this works correctly for any number of segments, not just
  today's two — this business already retired one segment (CCTV) and may add
  more, so nothing here assumes a fixed segment count.
*/

CREATE OR REPLACE FUNCTION get_segment_summary()
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
    GROUP BY segment_slug
  ),
  lead_counts AS (
    SELECT segment_slug,
           count(*) AS leads,
           count(*) FILTER (WHERE stage = 'won') AS won
    FROM marketing_leads
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

GRANT EXECUTE ON FUNCTION get_segment_summary() TO authenticated;

-- Same reasoning as the previous migration — force an immediate schema
-- cache reload so this RPC works the instant this migration is applied,
-- rather than waiting for PostgREST's periodic auto-reload.
NOTIFY pgrst, 'reload schema';
