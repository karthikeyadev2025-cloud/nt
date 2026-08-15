/*
  # Hero, About, and How We Work text — made CMS-editable (2026-08-14)

  Business owner asked to be able to edit all visible website text from
  Super Admin rather than it being hardcoded. Extending the same
  site_content pattern already used for stats/footer — no new admin UI
  needed, these rows show up in the existing Website Content editor
  automatically, grouped by section.
*/

INSERT INTO site_content (section, key, value, type) VALUES
  ('hero', 'badge', 'Digital Marketing, Custom Software & Business Compliance', 'text'),
  ('hero', 'tagline', 'Kite & Tail Digital Marketing • Custom Software • Business Compliance', 'text'),
  ('hero', 'description', 'Empowering businesses with data-driven performance advertising, custom software development, and end-to-end business registration & compliance.', 'text'),

  ('about', 'lead_text', 'Specialized divisions under one roof — growing your brand online, building the software that runs your business, and keeping you compliant — so you never juggle separate vendors.', 'text'),
  ('about', 'countries', 'UAE, UK, USA, Singapore, Australia, India', 'text'),

  ('how_it_works', 'heading', 'How We Work', 'text'),
  ('how_it_works', 'subheading', 'From first call to ongoing growth — the same four steps for every client, every time.', 'text'),
  ('how_it_works', 'step1_title', 'Discovery Call', 'text'),
  ('how_it_works', 'step1_body', 'A free 30-minute call to understand what you actually need — more leads, a working product, or both.', 'text'),
  ('how_it_works', 'step2_title', 'Proposal & Plan', 'text'),
  ('how_it_works', 'step2_body', 'A written scope, timeline, and fixed price before any work starts. No surprise invoices later.', 'text'),
  ('how_it_works', 'step3_title', 'Build & Launch', 'text'),
  ('how_it_works', 'step3_body', 'Kite & Tail runs your campaigns, or Nikki Software Studio ships your product — sometimes both at once.', 'text'),
  ('how_it_works', 'step4_title', 'Ongoing Growth', 'text'),
  ('how_it_works', 'step4_body', 'Monthly reporting and support after launch. We stay on as your technology partner, not a one-time vendor.', 'text')
ON CONFLICT (section, key) DO NOTHING;
