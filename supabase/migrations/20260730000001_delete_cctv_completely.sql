/*
  # Completely purge and delete all CCTV references (2026-07-30)

  Permanently removes all CCTV segment rows, CCTV service offerings,
  CCTV ticket types, CCTV onboarding document templates, and clears CCTV
  from any app_users segments arrays.
*/

-- Delete all CCTV services, ticket types, and document templates
DELETE FROM services WHERE segment_slug = 'cctv';
DELETE FROM ticket_types WHERE segment_slug = 'cctv';
DELETE FROM document_templates WHERE segment_slug = 'cctv';

-- Remove cctv from app_users segments array
UPDATE app_users SET segments = array_remove(segments, 'cctv');

-- Delete the CCTV segment row entirely
DELETE FROM segments WHERE slug = 'cctv';

-- Clean up any site_content text referencing CCTV
UPDATE site_content
SET value = 'Nikki Technologies — Digital marketing and software solutions under one roof.'
WHERE section = 'footer' AND key = 'about' AND value ILIKE '%cctv%';

UPDATE site_content
SET value = 'Kite & Tail Digital Marketing • Custom Software & Mobile Apps'
WHERE section = 'hero' AND key = 'subtitle' AND value ILIKE '%cctv%';
