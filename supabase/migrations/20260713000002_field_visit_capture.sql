/*
  # Field Visit Capture for Marketing Executives
  - lead_remarks: photo_url, latitude, longitude, address — a proper visit log (multiple visits per lead)
  - marketing_leads: last known photo/location kept in sync for quick reference on the board
  - Fix: marketing_executive should NOT see the full CRM board (was mistakenly granted full_leads_view) —
    like telecallers, they get a restricted "my assigned leads" experience, just visit-based instead of call-based.
*/

ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE lead_remarks ADD COLUMN IF NOT EXISTS address text;

UPDATE role_permissions SET permissions = permissions || '{"full_leads_view": false}'::jsonb
WHERE role_name = 'marketing_executive';
