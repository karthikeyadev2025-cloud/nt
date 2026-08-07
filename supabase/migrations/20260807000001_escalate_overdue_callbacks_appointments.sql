/*
  # Escalate overdue callbacks + missed appointments to managers (2026-08-07)

  Gap found: remind_due_followups() (20260727000007) already escalates an
  overdue next_followup_at to managers after 2 days. callback_at has no
  equivalent at all, and appointment_at only has
  remind_unassigned_appointments() (20260727000005), which is a different
  concern — "nobody's been assigned to attend" — not "the appointment time
  came and went and nobody logged what happened." A callback or a missed
  appointment can sit ignored indefinitely and no manager ever finds out.

  New stamp columns (separate from appointment_reminder_sent_at, which the
  unassigned-appointment reminder already owns — reusing it would make the
  two reminder types clear each other's state).
*/

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS callback_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_missed_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_callback_due ON marketing_leads (callback_at)
  WHERE callback_at IS NOT NULL;

-- Rescheduling either clears its own stamp so the new time gets chased.
CREATE OR REPLACE FUNCTION tg_clear_callback_and_appointment_missed_reminders() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.callback_at IS DISTINCT FROM OLD.callback_at THEN
    NEW.callback_reminder_sent_at := NULL;
  END IF;
  IF NEW.appointment_at IS DISTINCT FROM OLD.appointment_at THEN
    NEW.appointment_missed_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_callback_appt_missed_reminders ON marketing_leads;
CREATE TRIGGER trg_clear_callback_appt_missed_reminders
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION tg_clear_callback_and_appointment_missed_reminders();

CREATE OR REPLACE FUNCTION remind_overdue_callbacks_and_appointments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  l record;
  m record;
  n int := 0;
  when_txt text;
BEGIN
  -- Callbacks: same shape as the existing follow-up reminder — notify the
  -- owner immediately, escalate to segment managers after 2 days ignored.
  FOR l IN
    SELECT * FROM marketing_leads
    WHERE callback_at IS NOT NULL
      AND callback_reminder_sent_at IS NULL
      AND callback_at <= now()
      AND stage NOT IN ('won','lost')
      AND assigned_to IS NOT NULL
  LOOP
    when_txt := to_char(l.callback_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM');

    PERFORM notify_user(l.assigned_to, 'callback_due',
      'Callback due: ' || l.customer_name,
      'Requested for ' || when_txt || '. ' || COALESCE(l.phone, ''), '/portal');

    IF l.callback_at < now() - interval '2 days' THEN
      FOR m IN
        SELECT id FROM app_users
        WHERE is_active AND role IN ('manager','hr','super_admin')
          AND ('all' = ANY(segments) OR l.segment_slug = ANY(segments))
      LOOP
        PERFORM notify_user(m.id, 'callback_overdue',
          'Callback overdue: ' || l.customer_name,
          'Requested ' || when_txt || ' and still not actioned.', '/admin');
      END LOOP;
    END IF;

    UPDATE marketing_leads SET callback_reminder_sent_at = now() WHERE id = l.id;
    n := n + 1;
  END LOOP;

  -- Appointments: a shorter escalation window (4 hours, not 2 days) — a
  -- missed appointment is time-critical in a way a "call whenever" follow-
  -- up isn't. Only fires once the scheduled time has actually passed;
  -- upcoming appointments are covered separately by
  -- tg_lead_appointment_notify at booking time.
  FOR l IN
    SELECT * FROM marketing_leads
    WHERE appointment_at IS NOT NULL
      AND appointment_missed_reminder_sent_at IS NULL
      AND appointment_at <= now()
      AND stage NOT IN ('won','lost')
      AND assigned_to IS NOT NULL
  LOOP
    when_txt := to_char(l.appointment_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM');

    PERFORM notify_user(l.assigned_to, 'appointment_missed',
      'Appointment time passed: ' || l.customer_name,
      'Was scheduled for ' || when_txt || '. Log what happened.', '/portal');

    IF l.appointment_at < now() - interval '4 hours' THEN
      FOR m IN
        SELECT id FROM app_users
        WHERE is_active AND role IN ('manager','hr','super_admin')
          AND ('all' = ANY(segments) OR l.segment_slug = ANY(segments))
      LOOP
        PERFORM notify_user(m.id, 'appointment_missed_escalation',
          'Appointment missed, no outcome logged: ' || l.customer_name,
          'Was scheduled ' || when_txt || '.', '/admin');
      END LOOP;
    END IF;

    UPDATE marketing_leads SET appointment_missed_reminder_sent_at = now() WHERE id = l.id;
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION remind_overdue_callbacks_and_appointments() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('remind-overdue-callbacks-appointments')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-overdue-callbacks-appointments');
    PERFORM cron.schedule('remind-overdue-callbacks-appointments', '*/30 * * * *',
      'SELECT remind_overdue_callbacks_and_appointments();');
    RAISE NOTICE 'Scheduled callback/appointment-missed reminders via pg_cron (every 30 min).';
  ELSE
    RAISE NOTICE 'pg_cron unavailable — reminders run when a lead screen is opened.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job (%). Screen-triggered reminders still work.', SQLERRM;
END $$;
