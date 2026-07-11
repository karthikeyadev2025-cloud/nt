/*
  # Real workflow parity check against original Aadya portals:
  HR previously had read access to the CRM/leads (coordinating with sales on
  hiring needs, client escalations, etc). Our HR role was missing this.
*/
UPDATE role_permissions SET permissions = permissions || '{"view_leads": true}'::jsonb
WHERE role_name = 'hr';
