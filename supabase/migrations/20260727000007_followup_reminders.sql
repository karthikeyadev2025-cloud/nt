/*
  # Follow-up reminders + overdue visibility (2026-07-27)

  next_followup_at existed on marketing_leads but nothing in the application
  ever read or wrote it — a dead column. Field executives now set it when
  logging a visit, so it needs the same chasing treatment appointments got.

  remind_due_followups() notifies the lead owner when their scheduled
  follow-up falls due, and notifies managers when one is more than 2 days
  overdue (the owner has already been told once and hasn't acted).
*/

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS followup_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_followup ON marketing_leads (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

-- Rescheduling clears the stamp so the new date gets chased.
CREATE OR REPLACE FUNCTION tg_clear_followup_reminder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.next_followup_at IS DISTINCT FROM OLD.next_followup_at THEN
    NEW.followup_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_followup_reminder ON marketing_leads;
CREATE TRIGGER trg_clear_followup_reminder
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION tg_clear_followup_reminder();

CREATE OR REPLACE FUNCTION remind_due_followups()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  l record;
  m record;
  n int := 0;
  when_txt text;
BEGIN
  FOR l IN
    SELECT * FROM marketing_leads
    WHERE next_followup_at IS NOT NULL
      AND followup_reminder_sent_at IS NULL
      AND next_followup_at <= now()
      AND stage NOT IN ('won','lost')
      AND assigned_to IS NOT NULL
  LOOP
    when_txt := to_char(l.next_followup_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM');

    PERFORM notify_user(l.assigned_to, 'followup_due',
      'Follow-up due: ' || l.customer_name,
      'You scheduled this for ' || when_txt || '. ' || COALESCE(l.phone, ''),
      '/portal');

    -- More than 2 days past due: escalate to managers in that segment.
    IF l.next_followup_at < now() - interval '2 days' THEN
      FOR m IN
        SELECT id FROM app_users
        WHERE is_active AND role IN ('manager','hr','super_admin')
          AND ('all' = ANY(segments) OR l.segment_slug = ANY(segments))
      LOOP
        PERFORM notify_user(m.id, 'followup_overdue',
          'Follow-up overdue: ' || l.customer_name,
          'Scheduled ' || when_txt || ' and still not actioned.',
          '/admin');
      END LOOP;
    END IF;

    UPDATE marketing_leads SET followup_reminder_sent_at = now() WHERE id = l.id;
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION remind_due_followups() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('remind-due-followups')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-due-followups');
    PERFORM cron.schedule('remind-due-followups', '*/30 * * * *',
      'SELECT remind_due_followups();');
    RAISE NOTICE 'Scheduled follow-up reminders via pg_cron (every 30 min).';
  ELSE
    RAISE NOTICE 'pg_cron unavailable — follow-up reminders run when a lead screen is opened.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job (%). Screen-triggered reminders still work.', SQLERRM;
END $$;
