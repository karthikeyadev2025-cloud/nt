/*
  # Finish the CCTV cleanup safely (two prior attempts were incomplete)

  Found by executing both 20260730000001 and 20260730000002 against a database
  shaped like production (real CCTV leads/tickets already existing, not a
  fresh empty database).

  BUG 1 (20260730000002, line 4): `document_templates` has no `category`
  column — that table's column is `doc_type`. The DELETE fails immediately
  with "column does not exist", so nothing after it in that script ran.

  BUG 2 (both scripts): `DELETE FROM segments WHERE slug = 'cctv'` fails with
  a foreign-key violation whenever any marketing_leads or support_tickets row
  still references 'cctv' — which is true on any database that had real CCTV
  activity before the purge was attempted. This is not a bug in the
  constraint; it is the constraint deliberately doing its job (see the
  original segment-removal design: hard delete was never supported precisely
  because it would either fail like this, or silently orphan/destroy
  customer and financial history).

  NET RESULT verified by execution: on a database with real CCTV data, both
  migrations fail at the segment DELETE step. Services, ticket types and
  document templates DO get cleared (no blocking references), and staff DO
  get untagged from 'cctv' (no blocking references) — but the segments.cctv
  row itself is still sitting in the table, un-deleted, on any database where
  this was attempted with real CCTV leads/tickets present.

  This migration finishes the job safely:
    - Fixes the category→doc_type bug for document_templates
    - Re-runs every non-destructive cleanup step (idempotent, safe to repeat)
    - Ensures the segment is fully retired (active = false) rather than left
      in whatever partial state the failed attempts left it in
    - Does NOT delete marketing_leads or support_tickets rows tagged 'cctv' —
      that is real customer/business history (names, phone numbers, remarks,
      invoice amounts) and deleting it is a one-way action that must be a
      deliberate, informed choice, not something a migration does silently.

  If you want those old CCTV leads/tickets permanently destroyed too, that is
  a separate, explicit action — ask for it and it will be built as its own
  migration after you confirm exactly how many rows are involved.
*/

DELETE FROM services WHERE segment_slug = 'cctv' OR title ILIKE '%cctv%';
DELETE FROM ticket_types WHERE segment_slug = 'cctv' OR name ILIKE '%cctv%';
DELETE FROM document_templates WHERE segment_slug = 'cctv';

UPDATE app_users
SET segments = array_remove(segments, 'cctv')
WHERE 'cctv' = ANY(segments);

-- The segment cannot be hard-deleted while real leads/tickets reference it
-- (by design — see comment above). Ensure it is at minimum fully retired,
-- which is what actually makes it disappear everywhere a customer or staff
-- member would see it.
UPDATE segments SET active = false WHERE slug = 'cctv';

UPDATE site_content
SET value = 'Nikki Technologies — Digital marketing and software solutions under one roof.'
WHERE section = 'footer' AND key = 'about' AND value ILIKE '%cctv%';

UPDATE site_content
SET value = 'Digital Marketing • Custom Software & Mobile Apps'
WHERE section = 'hero' AND key = 'subtitle' AND value ILIKE '%cctv%';
