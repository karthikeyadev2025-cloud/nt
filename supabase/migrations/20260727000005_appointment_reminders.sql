/*
  # Appointment reminders for unallocated appointments (2026-07-27)

  A booked appointment stays with the telecaller until a manager assigns a
  field executive. Nothing chased that, so an appointment could sit
  unallocated until someone happened to open the Appointments board.

  This adds a reminder that fires when an appointment is inside the next 24
  hours and still has no executive against it.

  Idempotency: appointment_reminder_sent_at is stamped when the reminder goes
  out, so repeated runs (cron, plus the board calling it on load) never
  re-notify. Rescheduling clears the stamp, so a moved appointment is chased
  again.
*/

ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS appointment_reminder_sent_at timestamptz;

-- Rescheduling clears the reminder stamp so the new date gets chased.
CREATE OR REPLACE FUNCTION tg_clear_appointment_reminder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_at IS DISTINCT FROM OLD.appointment_at THEN
    NEW.appointment_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_appointment_reminder ON marketing_leads;
CREATE TRIGGER trg_clear_appointment_reminder
  BEFORE UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION tg_clear_appointment_reminder();

-- Notify managers/HR/super admins about appointments due within 24h that
-- still have no field executive assigned. Returns how many were chased.
CREATE OR REPLACE FUNCTION remind_unassigned_appointments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  lead_row record;
  m record;
  n int := 0;
  when_txt text;
  hours_left int;
BEGIN
  FOR lead_row IN
    SELECT l.* FROM marketing_leads l
    WHERE l.appointment_at IS NOT NULL
      AND l.appointment_reminder_sent_at IS NULL
      AND l.appointment_at > now()
      AND l.appointment_at <= now() + interval '24 hours'
      AND l.stage NOT IN ('won','lost')
      -- "Unallocated" = nobody, or still sitting with a non-executive
      -- (i.e. the telecaller who booked it).
      AND (
        l.assigned_to IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM app_users u
          WHERE u.id = l.assigned_to AND u.role = 'marketing_executive' AND u.is_active
        )
      )
  LOOP
    when_txt := to_char(lead_row.appointment_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM');
    hours_left := GREATEST(0, EXTRACT(epoch FROM (lead_row.appointment_at - now()))/3600)::int;

    FOR m IN
      SELECT id FROM app_users
      WHERE is_active AND role IN ('manager','hr','super_admin')
        AND ('all' = ANY(segments) OR lead_row.segment_slug = ANY(segments))
    LOOP
      PERFORM notify_user(m.id, 'appointment_unassigned',
        'No executive assigned: ' || lead_row.customer_name,
        'Appointment ' || when_txt || ' (in ~' || hours_left || 'h) still has no field executive.',
        '/admin');
    END LOOP;

    UPDATE marketing_leads SET appointment_reminder_sent_at = now() WHERE id = lead_row.id;
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION remind_unassigned_appointments() TO authenticated;

-- Schedule every 15 minutes when pg_cron is available. On projects without
-- it, the Appointments board calls the same function on load, so reminders
-- still go out whenever a manager opens the screen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('remind-unassigned-appointments')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-unassigned-appointments');
    PERFORM cron.schedule('remind-unassigned-appointments', '*/15 * * * *',
      'SELECT remind_unassigned_appointments();');
    RAISE NOTICE 'Scheduled appointment reminders via pg_cron (every 15 min).';
  ELSE
    RAISE NOTICE 'pg_cron unavailable — reminders run when the Appointments board is opened.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job (%). Board-triggered reminders still work.', SQLERRM;
END $$;
