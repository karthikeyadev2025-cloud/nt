/*
  # Service "best for" line — who this is actually for (2026-08-11)

  Each service already has a description and a "what's included" list,
  but neither answers the question a visitor actually has: is this
  relevant to ME? A features list assumes you already know you want
  the service; a plain "best for" line lets someone self-identify in
  one glance instead of reading four bullet points and inferring it.
*/

ALTER TABLE services ADD COLUMN IF NOT EXISTS best_for text DEFAULT '';
