/*
  # Fix: lead stage summary counts are wrong

  The bug
  -------
  The CRM's stage chips ("New (12)", "Qualified (5)" …) were computed in the
  browser from the leads array currently in memory:

      const funnel = {};
      filteredLeads.forEach(l => { funnel[l.stage] = (funnel[l.stage] || 0) + 1; });

  That array is the result of a query that ALREADY applies the segment and
  stage filters and caps at 400 rows. Two consequences:

  1. Click any stage chip and the query narrows to that stage — so every
     OTHER chip immediately reads (0). The summary claims the pipeline is
     empty everywhere except where you happen to be standing.
  2. Even unfiltered, counts stop at the row limit. A business with 900
     leads sees a funnel that adds up to 400.

  The summary is the one number on the screen that should describe the whole
  pipeline, and it was the number most affected by what you were looking at.

  The fix
  -------
  Count in the database, over the whole table, deliberately ignoring the
  stage filter (so chips stay comparable while you drill into one of them)
  but honouring segment, date range and search — the filters that define
  which pipeline you are looking at, rather than which slice of it.
*/

CREATE OR REPLACE FUNCTION get_lead_stage_counts(
  _segment_slug text DEFAULT NULL,
  _search       text DEFAULT NULL,
  _from         timestamptz DEFAULT NULL,
  _to           timestamptz DEFAULT NULL
)
RETURNS TABLE (stage text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER          -- deliberately NOT definer: counts must obey the
                          -- caller's RLS, so a segment-scoped user never
                          -- sees totals covering segments they can't open.
SET search_path = public
AS $$
  SELECT l.stage, count(*)::bigint
  FROM marketing_leads l
  WHERE (_segment_slug IS NULL OR _segment_slug = '' OR l.segment_slug = _segment_slug)
    AND (_from IS NULL OR l.created_at >= _from)
    AND (_to   IS NULL OR l.created_at <= _to)
    AND (
      _search IS NULL OR _search = ''
      OR l.customer_name ILIKE '%' || _search || '%'
      OR l.phone         ILIKE '%' || _search || '%'
      OR l.interested_in ILIKE '%' || _search || '%'
    )
  GROUP BY l.stage;
$$;

GRANT EXECUTE ON FUNCTION get_lead_stage_counts(text, text, timestamptz, timestamptz) TO authenticated;

-- Supports both the counts above and the board's default ordering.
CREATE INDEX IF NOT EXISTS idx_marketing_leads_segment_stage
  ON marketing_leads (segment_slug, stage);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_created
  ON marketing_leads (created_at DESC);
