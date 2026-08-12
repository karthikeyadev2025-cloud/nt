/*
  # Eight additional real services (2026-08-11)

  Confirmed directly with the business, not assumed: four additional
  Digital Media services and four additional Software Solutions
  services, on top of the original three per segment. Content matches
  PublicSite.tsx's fallback array exactly so live and fallback can't
  drift into showing different things.
*/

-- No unique constraint exists on (segment_slug, title) in this table, so
-- a bare ON CONFLICT DO NOTHING would be a no-op against fresh UUID
-- primary keys and wouldn't actually prevent duplicates on a re-run.
-- Guarding each insert with WHERE NOT EXISTS instead, which is genuinely
-- idempotent regardless of what constraints this table does or doesn't have.
INSERT INTO services (segment_slug, title, description, icon, highlights, best_for, order_index)
SELECT * FROM (VALUES
  ('digital_media', 'Content Writing & Copywriting',
   'Website copy, blog articles, ad copy, and product descriptions written to actually convert, not just fill space.',
   'FileText',
   ARRAY['Website & landing page copy', 'Blog articles & SEO content', 'Ad copy & product descriptions', 'Email & WhatsApp message copy'],
   'Businesses whose website reads like a brochure instead of speaking to the customer, or that need fresh content regularly and don''t have time to write it.',
   4),
  ('digital_media', 'Local SEO / Google Business',
   'Getting your business to actually show up when someone nearby searches for what you do — Google Business Profile setup, reviews, and local map pack ranking.',
   'MapPin',
   ARRAY['Google Business Profile setup', 'Local map pack ranking', 'Review generation & management', 'Local citation building'],
   'Local shops, clinics, and service businesses that depend on nearby customers finding them on Google Maps and search.',
   5),
  ('digital_media', 'WhatsApp Marketing',
   'Reaching customers directly on WhatsApp — broadcast campaigns, catalog sharing, and automated replies for enquiries.',
   'MessageCircle',
   ARRAY['Broadcast campaigns to customer lists', 'WhatsApp catalog setup', 'Automated quick replies', 'Order & appointment updates'],
   'Businesses whose customers already prefer messaging over calling, or that want a direct line for offers and updates.',
   6),
  ('digital_media', 'Website Design & Landing Pages',
   'A website or landing page built to convert visitors into enquiries, not just look good — fast, mobile-friendly, and tied into your ad campaigns.',
   'Globe',
   ARRAY['Mobile-first responsive design', 'Landing pages built for ad campaigns', 'Fast load times', 'Enquiry forms wired to your team'],
   'Businesses without a website yet, or whose current one is slow, outdated, or doesn''t convert visitors into enquiries.',
   7),
  ('software', 'E-commerce Store Development',
   'Online stores built to actually sell — product catalog, cart, checkout, and payment gateway integration.',
   'ShoppingCart',
   ARRAY['Product catalog & inventory', 'Cart & checkout flow', 'Payment gateway integration', 'Order management dashboard'],
   'Businesses ready to sell online, not just list products on social media and take orders manually.',
   4),
  ('software', 'API Integrations',
   'Connecting your existing tools together — payment gateways, SMS/WhatsApp providers, accounting software, and other systems that need to talk to each other.',
   'Plug',
   ARRAY['Payment gateway integration', 'SMS/WhatsApp API connections', 'Accounting software sync', 'Custom third-party integrations'],
   'Businesses juggling several separate tools that don''t talk to each other, creating manual double-entry work.',
   5),
  ('software', 'Maintenance & Support Plans',
   'Keeping a live product running — bug fixes, updates, and a direct line to us instead of starting from scratch with someone new every time something breaks.',
   'LifeBuoy',
   ARRAY['Bug fixes & updates', 'Security patches', 'Priority support response', 'Direct access to the team that built it'],
   'Businesses running a live product who want it maintained by the people who actually built it.',
   6),
  ('software', 'Data Dashboards & Analytics',
   'Turning your business data into a dashboard you can actually read — sales, attendance, leads, or whatever numbers you check daily, in one place.',
   'BarChart3',
   ARRAY['Custom dashboard build', 'Real-time data views', 'Exportable reports', 'Connects to your existing systems'],
   'Businesses making decisions off scattered spreadsheets or gut feeling instead of numbers they can see at a glance.',
   7)
) AS v(segment_slug, title, description, icon, highlights, best_for, order_index)
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.segment_slug = v.segment_slug AND s.title = v.title
);
