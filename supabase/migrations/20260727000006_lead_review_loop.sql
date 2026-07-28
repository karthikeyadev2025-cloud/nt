/*
  # Manager review loop + executive deal capture (2026-07-27)

  1. REVIEW NOTES ARE SILENT. A manager or super admin can already add a note
     to a lead, but lead_remarks has no notification trigger — the assigned
     telecaller or executive never learns that feedback exists unless they
     happen to reopen the lead. Review is therefore write-only in practice.

     Adds a 'review' call_type and a trigger that notifies the lead's current
     owner whenever someone OTHER than the owner comments. Managers reviewing
     their own leads don't notify themselves.

  2. CLOSED LEADS LOSE THEIR OWNER. ExecutiveFieldVisits set assigned_to=NULL
     on won/lost so the lead "returned to the pool". Combined with the handoff
     visibility cutoff, that means the person who closed the deal immediately
     loses sight of it — and their own conversion numbers, which count leads
     assigned to them, silently drop the moment they win. Ownership is now
     retained on close; the pool policy already excludes won/lost so nothing
     leaks back into anyone's queue.

     Backfills ownership for already-closed leads from whoever logged the
     closing remark, so historical credit isn't lost.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. 'review' remark type
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE lead_remarks DROP CONSTRAINT IF EXISTS lead_remarks_call_type_check;
ALTER TABLE lead_remarks ADD CONSTRAINT lead_remarks_call_type_check
  CHECK (call_type = ANY (ARRAY['outgoing','incoming','visit','whatsapp','email','note','review']));

-- Notify the lead's owner when someone else comments on their lead.
CREATE OR REPLACE FUNCTION tg_lead_remark_notify_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  owner_id uuid;
  cust text;
  author text;
BEGIN
  SELECT l.assigned_to, l.customer_name INTO owner_id, cust
  FROM marketing_leads l WHERE l.id = NEW.lead_id;

  -- Nobody to tell, or the author is the owner (no self-notification).
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- System-generated audit remarks ("Stage changed: …", "Reassigned: …") are
  -- written by triggers, not people. Notifying on them would mean every stage
  -- change pinged the owner about their own action.
  IF NEW.user_id IS NULL
     OR NEW.remark LIKE 'Stage changed:%'
     OR NEW.remark LIKE 'Reassigned:%' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO author FROM app_users WHERE id = NEW.user_id;

  PERFORM notify_user(
    owner_id,
    CASE WHEN NEW.call_type = 'review' THEN 'lead_review' ELSE 'lead_comment' END,
    CASE WHEN NEW.call_type = 'review'
         THEN 'Review on ' || COALESCE(cust, 'your lead')
         ELSE 'Note added on ' || COALESCE(cust, 'your lead') END,
    COALESCE(author, 'A manager') || ': ' || left(NEW.remark, 160),
    '/portal'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_remark_notify_owner ON lead_remarks;
CREATE TRIGGER trg_lead_remark_notify_owner
  AFTER INSERT ON lead_remarks
  FOR EACH ROW EXECUTE FUNCTION tg_lead_remark_notify_owner();

-- ═══════════════════════════════════════════════════════════════
-- 2. Restore ownership on already-closed leads
-- ═══════════════════════════════════════════════════════════════
-- Credit the person who logged the most recent remark before closure.
UPDATE marketing_leads l
SET assigned_to = r.user_id
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, user_id
  FROM lead_remarks
  WHERE user_id IS NOT NULL
  ORDER BY lead_id, created_at DESC
) r
WHERE l.id = r.lead_id
  AND l.assigned_to IS NULL
  AND l.stage IN ('won','lost');
