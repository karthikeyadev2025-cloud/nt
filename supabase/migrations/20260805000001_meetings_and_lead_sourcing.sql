/*
  # Meeting scheduler + lead sourcing (Phase 1 — 2026-08-05, rebuilt)

  Restored: patched-idempotent shape so re-running against a DB that already
  has some of these objects is a no-op instead of an error.

  Ships:
  1. meeting_types (renameable dropdown)
  2. meetings (full lifecycle with RLS)
  3. marketing_leads.sourced_by_user_id (nullable FK → app_users)
  4. RPCs: schedule_meeting, reschedule_meeting, cancel_meeting,
     record_meeting_outcome, list_meetings, meeting_has_conflict
  5. pg_cron: process_meeting_reminders every 10 min (24h + 1h + auto-no-show)
*/

BEGIN;

-- ─── 1. meeting_types ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]+$'),
  default_duration_minutes int NOT NULL DEFAULT 30 CHECK (default_duration_minutes BETWEEN 5 AND 480),
  description text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  order_index int NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read meeting types" ON meeting_types;
CREATE POLICY "auth read meeting types" ON meeting_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin write meeting types" ON meeting_types;
CREATE POLICY "admin write meeting types" ON meeting_types FOR ALL TO authenticated
  USING (has_permission('manage_catalog') OR is_super_admin())
  WITH CHECK (has_permission('manage_catalog') OR is_super_admin());

INSERT INTO meeting_types (slug, name, default_duration_minutes, order_index, description) VALUES
  ('discovery',   'Discovery Call',       15, 10, 'First contact to understand what the customer needs'),
  ('demo',        'Product Demo',         30, 20, 'Show the product to a qualified lead'),
  ('followup',    'Follow-up Call',       15, 30, 'Circle back on a prior discussion'),
  ('contract',    'Contract Discussion',  30, 40, 'Pricing, terms, and paperwork'),
  ('onboarding',  'Onboarding Kickoff',   60, 50, 'First working session after a deal closes'),
  ('field_visit', 'Field Visit',          60, 60, 'On-site meeting at the customer location'),
  ('internal',    'Internal Team Meeting',30, 70, 'Team-only meeting, not tied to a customer'),
  ('other',       'Other',                30, 99, 'Anything not fitting the other types')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. meetings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES marketing_leads(id) ON DELETE SET NULL,
  segment_slug text REFERENCES segments(slug),
  meeting_type_id uuid NOT NULL REFERENCES meeting_types(id) ON DELETE RESTRICT,
  organizer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  attendee_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  location_kind text NOT NULL DEFAULT 'google_meet'
    CHECK (location_kind IN ('google_meet','in_person','phone','other')),
  meet_link text,
  location_address text,
  customer_name text,
  customer_phone text,
  customer_email text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  agenda text DEFAULT '',
  outcome_notes text DEFAULT '',
  next_step text DEFAULT '',
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_organizer_time ON meetings (organizer_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_lead ON meetings (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_status_time ON meetings (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_segment ON meetings (segment_slug) WHERE segment_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_attendees_gin ON meetings USING gin (attendee_ids);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meetings view" ON meetings;
CREATE POLICY "meetings view" ON meetings FOR SELECT TO authenticated USING (
  organizer_id = auth.uid() OR auth.uid() = ANY (attendee_ids) OR is_super_admin()
  OR (has_permission('view_leads') AND (segment_slug IS NULL OR can_access_segment(segment_slug)))
);

DROP POLICY IF EXISTS "meetings insert" ON meetings;
CREATE POLICY "meetings insert" ON meetings FOR INSERT TO authenticated
  WITH CHECK (has_permission('manage_leads') AND organizer_id = auth.uid());

DROP POLICY IF EXISTS "meetings update" ON meetings;
CREATE POLICY "meetings update" ON meetings FOR UPDATE TO authenticated
  USING (organizer_id = auth.uid() OR is_super_admin() OR has_permission('manage_leads'))
  WITH CHECK (organizer_id = auth.uid() OR is_super_admin() OR has_permission('manage_leads'));

DROP POLICY IF EXISTS "meetings delete" ON meetings;
CREATE POLICY "meetings delete" ON meetings FOR DELETE TO authenticated USING (is_super_admin());

-- ─── 3. marketing_leads.sourced_by_user_id ──────────────────────
ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS sourced_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_sourced_by
  ON marketing_leads (sourced_by_user_id) WHERE sourced_by_user_id IS NOT NULL;

COMMENT ON COLUMN marketing_leads.sourced_by_user_id IS
  'Internal staff member who sourced/found this lead. Distinct from created_by (system entry) and assigned_to (current owner).';

-- ─── 4. RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meeting_has_conflict(
  _staff_id uuid, _at timestamptz, _duration_min int, _exclude_meeting_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.status = 'scheduled'
      AND (m.id IS DISTINCT FROM _exclude_meeting_id)
      AND (m.organizer_id = _staff_id OR _staff_id = ANY (m.attendee_ids))
      AND m.scheduled_at < _at + make_interval(mins => _duration_min)
      AND m.scheduled_at + make_interval(mins => m.duration_minutes) > _at
  );
$$;

CREATE OR REPLACE FUNCTION public.schedule_meeting(
  p_lead_id uuid, p_meeting_type_id uuid, p_scheduled_at timestamptz,
  p_duration_minutes int, p_location_kind text, p_meet_link text,
  p_location_address text, p_attendee_ids uuid[], p_agenda text,
  p_customer_name text DEFAULT NULL, p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL, p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meeting_id uuid;
  v_lead marketing_leads%ROWTYPE;
  v_seg text;
  v_cname text; v_cphone text; v_cemail text;
  v_attendee uuid;
  v_organizer_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT has_permission('manage_leads') THEN
    RAISE EXCEPTION 'You do not have permission to schedule meetings.';
  END IF;
  IF p_scheduled_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Cannot schedule a meeting in the past.';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 5 AND 480 THEN
    RAISE EXCEPTION 'Duration must be between 5 and 480 minutes.';
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM marketing_leads WHERE id = p_lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found.'; END IF;
    v_seg := v_lead.segment_slug;
    v_cname := COALESCE(p_customer_name, v_lead.customer_name);
    v_cphone := COALESCE(p_customer_phone, v_lead.phone);
    v_cemail := COALESCE(p_customer_email, NULLIF(v_lead.email, ''));
  ELSE
    v_seg := NULL;
    v_cname := p_customer_name; v_cphone := p_customer_phone; v_cemail := p_customer_email;
  END IF;

  IF NOT p_force THEN
    IF meeting_has_conflict(v_uid, p_scheduled_at, p_duration_minutes) THEN
      RETURN jsonb_build_object('ok', false, 'conflict', 'organizer',
        'message', 'You have another meeting overlapping this time. Re-submit with force=true to schedule anyway.');
    END IF;
    FOREACH v_attendee IN ARRAY COALESCE(p_attendee_ids, '{}') LOOP
      IF meeting_has_conflict(v_attendee, p_scheduled_at, p_duration_minutes) THEN
        RETURN jsonb_build_object('ok', false, 'conflict', 'attendee',
          'attendee_id', v_attendee,
          'message', 'A selected attendee has an overlapping meeting. Re-submit with force=true to schedule anyway.');
      END IF;
    END LOOP;
  END IF;

  INSERT INTO meetings (
    lead_id, segment_slug, meeting_type_id, organizer_id, attendee_ids,
    scheduled_at, duration_minutes, location_kind, meet_link, location_address,
    customer_name, customer_phone, customer_email, agenda, status
  ) VALUES (
    p_lead_id, v_seg, p_meeting_type_id, v_uid, COALESCE(p_attendee_ids, '{}'),
    p_scheduled_at, p_duration_minutes, p_location_kind, NULLIF(p_meet_link, ''), NULLIF(p_location_address, ''),
    v_cname, v_cphone, v_cemail, COALESCE(p_agenda, ''), 'scheduled'
  ) RETURNING id INTO v_meeting_id;

  SELECT full_name INTO v_organizer_name FROM app_users WHERE id = v_uid;
  FOREACH v_attendee IN ARRAY COALESCE(p_attendee_ids, '{}') LOOP
    IF v_attendee <> v_uid THEN
      INSERT INTO notifications (user_id, kind, title, body, link)
      VALUES (
        v_attendee, 'meeting_invite', 'You have been added to a meeting',
        format('%s scheduled a meeting on %s',
          COALESCE(v_organizer_name, 'Someone'),
          to_char(p_scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM')),
        '/portal'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'meeting_id', v_meeting_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_meeting(
  p_meeting_id uuid, p_new_at timestamptz, p_new_duration_minutes int DEFAULT NULL,
  p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_meeting meetings%ROWTYPE; v_dur int;
  v_attendee uuid; v_organizer_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_meeting FROM meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF v_meeting.organizer_id <> v_uid AND NOT is_super_admin() AND NOT has_permission('manage_leads') THEN
    RAISE EXCEPTION 'Only the organizer or a manager can reschedule this meeting.';
  END IF;
  IF v_meeting.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Cannot reschedule a % meeting.', v_meeting.status;
  END IF;
  IF p_new_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Cannot reschedule to a time in the past.';
  END IF;
  v_dur := COALESCE(p_new_duration_minutes, v_meeting.duration_minutes);
  IF NOT p_force AND meeting_has_conflict(v_meeting.organizer_id, p_new_at, v_dur, p_meeting_id) THEN
    RETURN jsonb_build_object('ok', false, 'conflict', 'organizer',
      'message', 'Organizer has another meeting overlapping this time.');
  END IF;
  UPDATE meetings SET scheduled_at = p_new_at, duration_minutes = v_dur,
    reminder_24h_sent_at = NULL, reminder_1h_sent_at = NULL, updated_at = now()
    WHERE id = p_meeting_id;
  SELECT full_name INTO v_organizer_name FROM app_users WHERE id = v_meeting.organizer_id;
  FOREACH v_attendee IN ARRAY v_meeting.attendee_ids LOOP
    IF v_attendee <> v_uid THEN
      INSERT INTO notifications (user_id, kind, title, body, link)
      VALUES (v_attendee, 'meeting_rescheduled', 'Meeting rescheduled',
        format('%s moved a meeting to %s',
          COALESCE(v_organizer_name, 'Someone'),
          to_char(p_new_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM')),
        '/portal');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_meeting(p_meeting_id uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_meeting meetings%ROWTYPE; v_attendee uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_meeting FROM meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF v_meeting.organizer_id <> v_uid AND NOT is_super_admin() AND NOT has_permission('manage_leads') THEN
    RAISE EXCEPTION 'Only the organizer or a manager can cancel this meeting.';
  END IF;
  IF v_meeting.status <> 'scheduled' THEN RAISE EXCEPTION 'Cannot cancel a % meeting.', v_meeting.status; END IF;
  UPDATE meetings SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
    cancel_reason = COALESCE(p_reason, ''), updated_at = now() WHERE id = p_meeting_id;
  FOREACH v_attendee IN ARRAY v_meeting.attendee_ids LOOP
    IF v_attendee <> v_uid THEN
      INSERT INTO notifications (user_id, kind, title, body, link)
      VALUES (v_attendee, 'meeting_cancelled', 'Meeting cancelled',
        format('A meeting scheduled for %s was cancelled.',
          to_char(v_meeting.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM')),
        '/portal');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_meeting_outcome(
  p_meeting_id uuid, p_outcome text, p_notes text, p_next_step text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_meeting meetings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_outcome NOT IN ('completed','no_show') THEN RAISE EXCEPTION 'Outcome must be completed or no_show.'; END IF;
  SELECT * INTO v_meeting FROM meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF v_meeting.organizer_id <> v_uid AND v_uid <> ALL (v_meeting.attendee_ids)
     AND NOT is_super_admin() AND NOT has_permission('manage_leads') THEN
    RAISE EXCEPTION 'Only the organizer or an attendee can record the outcome.';
  END IF;
  UPDATE meetings SET status = p_outcome, outcome_notes = COALESCE(p_notes, ''),
    next_step = COALESCE(p_next_step, ''), updated_at = now() WHERE id = p_meeting_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_meetings(
  p_from timestamptz, p_to timestamptz, p_scope text DEFAULT 'mine'
) RETURNS TABLE (
  id uuid, lead_id uuid, segment_slug text, meeting_type_name text, meeting_type_slug text,
  organizer_id uuid, organizer_name text, attendee_ids uuid[],
  scheduled_at timestamptz, duration_minutes int, location_kind text,
  meet_link text, location_address text, customer_name text, customer_phone text,
  status text, agenda text, outcome_notes text, next_step text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.lead_id, m.segment_slug, mt.name, mt.slug,
    m.organizer_id, u.full_name, m.attendee_ids,
    m.scheduled_at, m.duration_minutes, m.location_kind, m.meet_link, m.location_address,
    m.customer_name, m.customer_phone, m.status, m.agenda, m.outcome_notes, m.next_step
  FROM meetings m
  JOIN meeting_types mt ON mt.id = m.meeting_type_id
  LEFT JOIN app_users u ON u.id = m.organizer_id
  WHERE m.scheduled_at >= p_from AND m.scheduled_at < p_to
    AND (
      p_scope = 'all' AND (is_super_admin() OR has_permission('manage_leads'))
      OR p_scope = 'team' AND has_permission('view_leads')
        AND (m.segment_slug IS NULL OR can_access_segment(m.segment_slug)
             OR m.organizer_id = auth.uid() OR auth.uid() = ANY (m.attendee_ids))
      OR p_scope = 'mine' AND (m.organizer_id = auth.uid() OR auth.uid() = ANY (m.attendee_ids))
    )
  ORDER BY m.scheduled_at;
$$;

REVOKE EXECUTE ON FUNCTION public.meeting_has_conflict(uuid, timestamptz, int, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.meeting_has_conflict(uuid, timestamptz, int, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_meeting(uuid, uuid, timestamptz, int, text, text, text, uuid[], text, text, text, text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.schedule_meeting(uuid, uuid, timestamptz, int, text, text, text, uuid[], text, text, text, text, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reschedule_meeting(uuid, timestamptz, int, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reschedule_meeting(uuid, timestamptz, int, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_meeting(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_meeting(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_meeting_outcome(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_meeting_outcome(uuid, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_meetings(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_meetings(timestamptz, timestamptz, text) TO authenticated;

-- ─── 5. pg_cron reminders ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_meeting_reminders() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, kind, title, body, link)
  SELECT unnest(ARRAY[m.organizer_id] || m.attendee_ids), 'meeting_reminder_24h', 'Meeting tomorrow',
    format('%s with %s at %s', mt.name, COALESCE(m.customer_name, 'internal team'),
      to_char(m.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM')), '/portal'
  FROM meetings m JOIN meeting_types mt ON mt.id = m.meeting_type_id
  WHERE m.status = 'scheduled' AND m.reminder_24h_sent_at IS NULL
    AND m.scheduled_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours';
  UPDATE meetings SET reminder_24h_sent_at = now()
  WHERE status = 'scheduled' AND reminder_24h_sent_at IS NULL
    AND scheduled_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours';

  INSERT INTO notifications (user_id, kind, title, body, link)
  SELECT unnest(ARRAY[m.organizer_id] || m.attendee_ids), 'meeting_reminder_1h', 'Meeting starting soon',
    format('%s at %s%s', mt.name,
      to_char(m.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM'),
      CASE WHEN m.meet_link IS NOT NULL THEN ' — Meet link in the meeting details' ELSE '' END), '/portal'
  FROM meetings m JOIN meeting_types mt ON mt.id = m.meeting_type_id
  WHERE m.status = 'scheduled' AND m.reminder_1h_sent_at IS NULL
    AND m.scheduled_at BETWEEN now() + interval '30 minutes' AND now() + interval '90 minutes';
  UPDATE meetings SET reminder_1h_sent_at = now()
  WHERE status = 'scheduled' AND reminder_1h_sent_at IS NULL
    AND scheduled_at BETWEEN now() + interval '30 minutes' AND now() + interval '90 minutes';

  UPDATE meetings SET status = 'no_show',
    outcome_notes = COALESCE(NULLIF(outcome_notes, ''), 'Auto-flagged as no-show: no outcome recorded 4h past scheduled time.'),
    updated_at = now()
  WHERE status = 'scheduled'
    AND scheduled_at + make_interval(mins => duration_minutes) < now() - interval '4 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_meeting_reminders() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_meeting_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process_meeting_reminders_10min';
    PERFORM cron.schedule('process_meeting_reminders_10min', '*/10 * * * *',
      $cron$ SELECT public.process_meeting_reminders(); $cron$);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
