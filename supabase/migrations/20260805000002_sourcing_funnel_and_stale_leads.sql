/*
  # Sourcing funnel + stale-lead alerts (2026-08-05)

  Two features that both build on Phase 1's marketing_leads.sourced_by_user_id:

  ─────────────────────────────────────────────────────────────
  1. sourcing_funnel_report RPC
  ─────────────────────────────────────────────────────────────
  "Who's my best sourcing employee?" — the primary reason you asked for the
  sourced_by column in the first place. Aggregates leads by sourcer and
  segments them into stages so the dashboard can render a funnel table.

  Buckets a lead is counted in exactly one of:
    • total     — every lead they sourced in the window
    • contacted — currently in 'contacted', 'qualified', or 'quoted'
                  (i.e. actively worked but not yet won or lost)
    • won       — closed as a deal
    • lost      — closed as lost or not_answered

  Win rate = won / (won + lost). Excludes leads still in-progress from the
  denominator so a person's rate isn't dragged down by leads they just
  sourced yesterday.

  Segment filter: optional. Date range: required. Permission: manage_leads
  or super_admin — telecallers shouldn't see their peers' win rates.

  ─────────────────────────────────────────────────────────────
  2. Stale-lead alerts
  ─────────────────────────────────────────────────────────────
  A lead in 'new'/'contacted'/'qualified' with no lead_remarks activity in
  7 days is "stale" — someone forgot about it or it's genuinely dead.
  Either way, the assigned executive or (if unassigned) a manager needs
  to see it. Quoted/won/lost/not_answered leads are excluded — those are
  closed states or explicit stages the executive owns.

  Dedup: we don't want to notify about the same stale lead every night for
  a week. A tiny lead_stale_notifications table tracks the last notification
  per lead; we skip if it fired in the last 3 days. Auto-cleared once the
  lead has fresh activity (a remark posts → the trigger removes the row so
  next staleness starts a new cycle).

  Scheduling: pg_cron daily at 01:30 UTC (07:00 IST) so notifications land
  before the workday starts — the executive sees them when they open the
  portal, not mid-afternoon after they've already forgotten about the leads.
*/

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. sourcing_funnel_report RPC
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sourcing_funnel_report(
  p_from timestamptz,
  p_to timestamptz,
  p_segment_slug text DEFAULT NULL
) RETURNS TABLE (
  sourcer_id uuid,
  sourcer_name text,
  sourcer_role text,
  total_leads bigint,
  contacted_leads bigint,
  won_leads bigint,
  lost_leads bigint,
  in_progress_leads bigint,
  win_rate_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR has_permission('manage_leads')) THEN
    RAISE EXCEPTION 'You do not have permission to view sourcing reports.';
  END IF;

  RETURN QUERY
  SELECT
    u.id, u.full_name, u.role,
    count(l.id)::bigint AS total,
    count(l.id) FILTER (WHERE l.stage IN ('contacted','qualified','quoted'))::bigint AS contacted,
    count(l.id) FILTER (WHERE l.stage = 'won')::bigint AS won,
    count(l.id) FILTER (WHERE l.stage IN ('lost','not_answered'))::bigint AS lost,
    count(l.id) FILTER (WHERE l.stage IN ('new','contacted','qualified','quoted'))::bigint AS in_progress,
    -- Rate over decided leads only. NULL if none decided yet — the client
    -- shows "—" for those so a person with 5 sourced but 0 decided doesn't
    -- read as "0% win rate".
    CASE
      WHEN count(l.id) FILTER (WHERE l.stage IN ('won','lost','not_answered')) = 0 THEN NULL
      ELSE round(
        100.0 * count(l.id) FILTER (WHERE l.stage = 'won')
        / NULLIF(count(l.id) FILTER (WHERE l.stage IN ('won','lost','not_answered')), 0),
        1
      )
    END AS win_rate_pct
  FROM app_users u
  JOIN marketing_leads l ON l.sourced_by_user_id = u.id
  WHERE l.created_at >= p_from
    AND l.created_at <  p_to
    AND (p_segment_slug IS NULL OR l.segment_slug = p_segment_slug)
  GROUP BY u.id, u.full_name, u.role
  HAVING count(l.id) > 0
  ORDER BY count(l.id) FILTER (WHERE l.stage = 'won') DESC, count(l.id) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sourcing_funnel_report(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sourcing_funnel_report(timestamptz, timestamptz, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Stale-lead alerts
-- ═══════════════════════════════════════════════════════════════════════

-- Dedup table — one row per lead that we've notified about staleness.
-- Auto-cleared by the trigger below when the lead has fresh activity.
CREATE TABLE IF NOT EXISTS lead_stale_notifications (
  lead_id uuid PRIMARY KEY REFERENCES marketing_leads(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  notified_user_ids uuid[] NOT NULL DEFAULT '{}'
);

ALTER TABLE lead_stale_notifications ENABLE ROW LEVEL SECURITY;
-- Read-only for staff — helps them see "this alert is because it's been
-- stale since X" if we surface it in the UI later. Writes are all
-- via SECURITY DEFINER functions.
CREATE POLICY "auth read stale notifications" ON lead_stale_notifications
  FOR SELECT TO authenticated USING (
    is_super_admin() OR has_permission('manage_leads')
  );

-- Trigger: when a new remark posts against a lead, clear its stale record
-- so the next round of staleness starts fresh (3-day cool-down resets).
CREATE OR REPLACE FUNCTION public.clear_stale_on_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM lead_stale_notifications WHERE lead_id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_stale_on_remark ON lead_remarks;
CREATE TRIGGER trg_clear_stale_on_remark
  AFTER INSERT ON lead_remarks
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_on_activity();

-- Also clear when the lead is updated to a closed stage (won/lost/not_answered)
-- or when someone changes the assignee — those are meaningful activity too.
CREATE OR REPLACE FUNCTION public.clear_stale_on_lead_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage IN ('won','lost','not_answered')
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    DELETE FROM lead_stale_notifications WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_stale_on_lead ON marketing_leads;
CREATE TRIGGER trg_clear_stale_on_lead
  AFTER UPDATE OF stage, assigned_to ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_on_lead_change();

-- The processor: finds stale leads, notifies the right person(s), writes
-- to the dedup table. Runs daily via pg_cron.
CREATE OR REPLACE FUNCTION public.notify_stale_leads() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead record;
  v_recipient uuid;
  v_recipients uuid[];
  v_last_activity timestamptz;
  v_notified_count int := 0;
  v_skipped_count int := 0;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.customer_name, l.phone, l.segment_slug, l.stage,
           l.assigned_to, l.sourced_by_user_id, l.created_at
    FROM marketing_leads l
    WHERE l.stage IN ('new','contacted','qualified')
    -- Cool-down: skip if notified in the last 3 days already.
    AND NOT EXISTS (
      SELECT 1 FROM lead_stale_notifications sn
      WHERE sn.lead_id = l.id
        AND sn.notified_at > now() - interval '3 days'
    )
  LOOP
    -- Latest activity = most recent of created_at or last remark.
    SELECT COALESCE(MAX(created_at), v_lead.created_at) INTO v_last_activity
      FROM lead_remarks WHERE lead_id = v_lead.id;

    -- Not stale yet — skip.
    IF v_last_activity > now() - interval '7 days' THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Build the recipient list. Prefer the assignee; fall back to segment
    -- managers if unassigned. Cap at 5 recipients to prevent a stale lead
    -- in a segment with 20 managers from spamming everyone.
    v_recipients := '{}';
    IF v_lead.assigned_to IS NOT NULL THEN
      v_recipients := v_recipients || v_lead.assigned_to;
    ELSE
      -- Find any user with manage_leads who can access this segment.
      -- Limit 5 so we don't hammer a whole team about one lead.
      SELECT array_agg(u.id)
        INTO v_recipients
      FROM (
        SELECT au.id FROM app_users au
        WHERE au.is_active = true
          AND (
            au.role = 'super_admin'
            OR ('all' = ANY (au.segments))
            OR v_lead.segment_slug = ANY (au.segments)
          )
          AND EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_name = au.role
              AND rp.perm_key = 'manage_leads'
              AND rp.granted = true
          )
        LIMIT 5
      ) u;
      v_recipients := COALESCE(v_recipients, '{}');
    END IF;

    -- Also always CC the sourcer so they know their sourced lead is going stale.
    IF v_lead.sourced_by_user_id IS NOT NULL
       AND NOT (v_lead.sourced_by_user_id = ANY (v_recipients)) THEN
      v_recipients := v_recipients || v_lead.sourced_by_user_id;
    END IF;

    -- Nobody to notify — record and move on. Prevents infinite retries
    -- on genuinely orphaned leads.
    IF cardinality(v_recipients) = 0 THEN
      INSERT INTO lead_stale_notifications (lead_id, notified_user_ids)
        VALUES (v_lead.id, '{}')
        ON CONFLICT (lead_id) DO UPDATE SET notified_at = now(), notified_user_ids = '{}';
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    FOREACH v_recipient IN ARRAY v_recipients LOOP
      INSERT INTO notifications (user_id, kind, title, body, link)
      VALUES (
        v_recipient,
        'lead_stale',
        'Lead needs attention',
        format('%s (%s) — no activity for %s days. Stage: %s.',
          v_lead.customer_name, v_lead.phone,
          extract(day FROM now() - v_last_activity)::int,
          v_lead.stage
        ),
        '/portal'
      );
    END LOOP;

    INSERT INTO lead_stale_notifications (lead_id, notified_user_ids)
      VALUES (v_lead.id, v_recipients)
      ON CONFLICT (lead_id) DO UPDATE
        SET notified_at = now(),
            notified_user_ids = EXCLUDED.notified_user_ids;

    v_notified_count := v_notified_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'notified', v_notified_count,
    'skipped', v_skipped_count,
    'processed_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_stale_leads() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.notify_stale_leads() TO service_role;

-- Schedule daily at 01:30 UTC (07:00 IST) — starts the workday with
-- fresh alerts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'notify_stale_leads_daily';
    PERFORM cron.schedule(
      'notify_stale_leads_daily',
      '30 1 * * *',
      $cron$ SELECT public.notify_stale_leads(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule notify_stale_leads() manually.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
