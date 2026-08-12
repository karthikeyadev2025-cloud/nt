/*
  # Richer service descriptions — highlights (2026-08-11)

  The public landing page's service cards only ever had a one-line
  description — genuinely thin for a page whose whole job is explaining
  what the business offers. Adding a short "what's included" bullet
  list per service, editable from the same CMS screen (Services &
  Ticket Types) that already manages title/description, so this isn't
  just richer hardcoded fallback content but something Super Admin can
  actually keep updated going forward.
*/

ALTER TABLE services ADD COLUMN IF NOT EXISTS highlights text[] DEFAULT '{}';
