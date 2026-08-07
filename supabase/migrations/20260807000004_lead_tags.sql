/*
  # Lead tags/labels (2026-08-07)

  Free-form labels a staff member can attach to a lead at creation (or
  later) — "Hot Lead", "Referral", "VIP", custom text. Plain text array,
  no separate lookup table: tags here are meant to be fast and informal,
  not a managed taxonomy: unlike stage/priority/source, there's no fixed
  set of valid values.
*/

ALTER TABLE marketing_leads ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_leads_tags ON marketing_leads USING GIN (tags);
