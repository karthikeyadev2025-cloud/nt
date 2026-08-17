/*
  # Remove "Kite & Tail" branding — rename to plain "Digital Marketing" (2026-08-15)

  Business owner asked to drop the "Kite & Tail" sub-brand entirely and
  just call this division "Digital Marketing." Updating the live rows
  directly rather than editing the original seed migration, which stays
  as an accurate historical record of what was inserted at the time.
*/

UPDATE segments SET
  name = 'Digital Marketing',
  tagline = 'Performance Ads, Social Media & Brand Growth'
WHERE slug = 'digital_media';

UPDATE site_content SET value = 'Digital Marketing • Custom Software • Business Compliance'
WHERE section = 'hero' AND key = 'tagline';

UPDATE site_content SET value = 'Our marketing team runs your campaigns, or Nikki Software Studio ships your product — sometimes both at once.'
WHERE section = 'how_it_works' AND key = 'step3_body';
