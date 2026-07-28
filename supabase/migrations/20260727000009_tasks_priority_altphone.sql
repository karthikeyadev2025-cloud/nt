/*
  # Task management, lead priority, alternate contact (2026-07-27)

  Workflow capabilities the portal was missing.

  1. TASKS. There was no way to assign work that isn't a lead or a ticket —
     "collect payment from X", "prepare the campaign", "renew the DSC". A
     manager had no mechanism for it at all, so that work lived in WhatsApp.

     Segment-scoped like everything else: you see tasks assigned to you, tasks
     you created, and (with view_staff) tasks across segments you can access.

  2. LEAD PRIORITY. Stage says where a lead is in the funnel; it says nothing
     about urgency. A telecaller's queue couldn't distinguish a hot enquiry
     from a cold one.

  3. ALTERNATE PHONE. In India the second number is often the one that
     actually answers.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Lead priority + alternate contact
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS alternate_phone text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_leads_priority ON marketing_leads (priority)
  WHERE stage NOT IN ('won','lost');

-- ═══════════════════════════════════════════════════════════════
-- 2. Tasks
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS office_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  due_date date,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  category text DEFAULT '',
  completed_at timestamptz,
  completion_note text DEFAULT '',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON office_tasks (assigned_to)
  WHERE status IN ('pending','in_progress');
CREATE INDEX IF NOT EXISTS idx_tasks_due ON office_tasks (due_date)
  WHERE status IN ('pending','in_progress');

ALTER TABLE office_tasks ENABLE ROW LEVEL SECURITY;

-- Mine, or mine to oversee.
CREATE POLICY "view own and managed tasks" ON office_tasks FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR is_super_admin()
    OR (has_permission('view_staff') AND (segment_slug IS NULL OR can_access_segment(segment_slug)))
  );

-- Anyone who manages people or work can raise a task.
CREATE POLICY "create tasks" ON office_tasks FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR has_permission('manage_staff')
    OR has_permission('view_staff')
    OR has_permission('manage_leads')
  );

-- The assignee can move status and add a completion note; owners/managers can
-- edit everything. The privileged-column guard below stops an assignee
-- reassigning a task to someone else or rewriting the brief.
CREATE POLICY "update own or managed tasks" ON office_tasks FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR is_super_admin()
    OR (has_permission('view_staff') AND (segment_slug IS NULL OR can_access_segment(segment_slug)))
  )
  WITH CHECK (true);

CREATE POLICY "delete own tasks" ON office_tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_super_admin() OR has_permission('manage_staff'));

-- An assignee may progress a task, not redefine it.
CREATE OR REPLACE FUNCTION tg_guard_task_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.created_by = auth.uid()
     OR is_super_admin()
     OR has_permission('manage_staff')
     OR has_permission('view_staff') THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.segment_slug IS DISTINCT FROM OLD.segment_slug
  THEN
    RAISE EXCEPTION 'You can update the status of this task, but not reassign or redefine it';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_task_fields ON office_tasks;
CREATE TRIGGER trg_guard_task_fields BEFORE UPDATE ON office_tasks
  FOR EACH ROW EXECUTE FUNCTION tg_guard_task_fields();

-- Stamp completion time automatically.
CREATE OR REPLACE FUNCTION tg_task_completed_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_task_completed_at ON office_tasks;
CREATE TRIGGER trg_task_completed_at BEFORE UPDATE ON office_tasks
  FOR EACH ROW EXECUTE FUNCTION tg_task_completed_at();

-- Notify on assignment, and notify the raiser when it's done.
CREATE OR REPLACE FUNCTION tg_task_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM notify_user(NEW.assigned_to, 'task_assigned',
        'New task: ' || NEW.title,
        COALESCE(NULLIF(NEW.description,''), 'No further details')
          || CASE WHEN NEW.due_date IS NOT NULL THEN ' — due ' || to_char(NEW.due_date,'DD Mon') ELSE '' END,
        '/portal');
    END IF;
    RETURN NEW;
  END IF;

  -- Reassigned to someone new.
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(NEW.assigned_to, 'task_assigned',
      'Task assigned to you: ' || NEW.title,
      COALESCE(NULLIF(NEW.description,''), 'No further details'), '/portal');
  END IF;

  -- Finished — tell whoever raised it.
  IF NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed'
     AND NEW.created_by IS NOT NULL AND NEW.created_by <> auth.uid() THEN
    PERFORM notify_user(NEW.created_by, 'task_completed',
      'Task completed: ' || NEW.title,
      COALESCE(NULLIF(NEW.completion_note,''), 'Marked complete'), '/admin');
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_task_notify ON office_tasks;
CREATE TRIGGER trg_task_notify AFTER INSERT OR UPDATE ON office_tasks
  FOR EACH ROW EXECUTE FUNCTION tg_task_notify();

-- Chase overdue tasks: assignee first, then managers once badly overdue.
ALTER TABLE office_tasks ADD COLUMN IF NOT EXISTS overdue_reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION remind_overdue_tasks()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  t record; m record; n int := 0;
BEGIN
  FOR t IN
    SELECT * FROM office_tasks
    WHERE status IN ('pending','in_progress')
      AND due_date IS NOT NULL
      AND due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND overdue_reminder_sent_at IS NULL
  LOOP
    IF t.assigned_to IS NOT NULL THEN
      PERFORM notify_user(t.assigned_to, 'task_overdue',
        'Task overdue: ' || t.title,
        'Was due ' || to_char(t.due_date,'DD Mon'), '/portal');
    END IF;

    IF t.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date - 2 THEN
      FOR m IN
        SELECT id FROM app_users
        WHERE is_active AND role IN ('manager','hr','super_admin')
          AND (t.segment_slug IS NULL OR 'all' = ANY(segments) OR t.segment_slug = ANY(segments))
      LOOP
        PERFORM notify_user(m.id, 'task_overdue',
          'Task still open: ' || t.title,
          'Due ' || to_char(t.due_date,'DD Mon') || ' and not completed.', '/admin');
      END LOOP;
    END IF;

    UPDATE office_tasks SET overdue_reminder_sent_at = now() WHERE id = t.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION remind_overdue_tasks() TO authenticated;

-- Clear the stamp when the due date moves.
CREATE OR REPLACE FUNCTION tg_clear_task_reminder() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    NEW.overdue_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_task_reminder ON office_tasks;
CREATE TRIGGER trg_clear_task_reminder BEFORE UPDATE ON office_tasks
  FOR EACH ROW EXECUTE FUNCTION tg_clear_task_reminder();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('remind-overdue-tasks')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-overdue-tasks');
    PERFORM cron.schedule('remind-overdue-tasks', '0 * * * *',
      'SELECT remind_overdue_tasks();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable for task reminders (%); screen-triggered sweep still works.', SQLERRM;
END $$;
