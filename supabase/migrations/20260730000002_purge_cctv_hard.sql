-- Purge any CCTV rows completely across all tables
DELETE FROM services WHERE segment_slug ILIKE '%cctv%' OR title ILIKE '%cctv%';
DELETE FROM ticket_types WHERE segment_slug ILIKE '%cctv%' OR name ILIKE '%cctv%';
DELETE FROM document_templates WHERE category ILIKE '%cctv%';
DELETE FROM segments WHERE slug ILIKE '%cctv%' OR name ILIKE '%cctv%';

UPDATE app_users 
SET segments = array_remove(segments, 'cctv')
WHERE 'cctv' = ANY(segments);
