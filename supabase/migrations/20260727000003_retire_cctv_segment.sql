/*
  # Retire the CCTV segment (2026-07-27)

  The company repositioned as a digital marketing + software business
  (commit 39ff91b removed CCTV from public SEO copy), but the segment and its
  seeded content were still live in the database: 3 services, 5 ticket types,
  4 document templates, and a footer line advertising CCTV installation.

  Verified before writing this: the cctv segment has 0 leads, 0 tickets and
  0 assigned staff, so nothing is stranded by retiring it.

  This is deliberately a RETIRE, not a DELETE. segments.active=false keeps the
  row intact so any historical record that ever referenced 'cctv' still
  resolves, while the public site and new-record dropdowns stop offering it.
  Reversible: set active=true to bring it back.
*/

-- Retire the segment (kept for referential history, hidden from pickers).
UPDATE segments SET active = false WHERE slug = 'cctv';

-- Stop offering CCTV services / ticket types on the public site and forms.
UPDATE services SET active = false WHERE segment_slug = 'cctv';

DELETE FROM ticket_types WHERE segment_slug = 'cctv';

-- CCTV-specific offer/welcome letter variants are no longer issuable.
-- The segment-agnostic templates (segment_slug IS NULL) remain and are what
-- onboarding falls back to.
DELETE FROM document_templates WHERE segment_slug = 'cctv';

-- Footer still advertised CCTV installation.
UPDATE site_content
SET value = 'Nikki Technologies — digital media and software solutions under one roof.'
WHERE section = 'footer' AND key = 'about' AND value ILIKE '%cctv%';

-- Any remaining site copy mentioning CCTV is left for manual review rather
-- than blind string replacement; this surfaces it in the logs.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM site_content WHERE value ILIKE '%cctv%';
  IF n > 0 THEN
    RAISE NOTICE 'site_content still has % row(s) mentioning CCTV — review under Website Content.', n;
  END IF;
END $$;
