/*
  # Hero illustration stats — Avg Lead Growth and Client Rating shown on the
  new hero card had no editable source; added to the existing 'stats'
  section (same pattern as years_in_business/clients_served/
  projects_completed) so they show up in the Super Admin Website Content
  editor automatically alongside the others, rather than living in a new
  section an admin would have to know to look for.
*/
INSERT INTO site_content (section, key, value, type) VALUES
  ('stats', 'avg_lead_growth', '+248%', 'text'),
  ('stats', 'client_rating', '4.9', 'text')
ON CONFLICT (section, key) DO NOTHING;
