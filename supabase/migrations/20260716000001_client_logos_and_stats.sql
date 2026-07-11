/*
  # Client logos (the "Trusted By" strip) — was never built despite testimonials existing.
*/
CREATE TABLE IF NOT EXISTS client_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE SET NULL,
  name text NOT NULL,
  logo_url text NOT NULL,
  order_index int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE client_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read client logos" ON client_logos FOR SELECT USING (active = true OR is_super_admin() OR has_permission('manage_content'));
CREATE POLICY "cms manage client logos" ON client_logos FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_content'))
  WITH CHECK (is_super_admin() OR has_permission('manage_content'));

INSERT INTO site_content (section, key, value, type) VALUES
  ('stats', 'years_in_business', '2+', 'text'),
  ('stats', 'clients_served', '50+', 'text'),
  ('stats', 'projects_completed', '100+', 'text')
ON CONFLICT (section, key) DO NOTHING;
