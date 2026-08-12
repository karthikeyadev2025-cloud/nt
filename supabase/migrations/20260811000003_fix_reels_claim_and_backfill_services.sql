/*
  # Fix false video/reels claim + backfill highlights/best_for on live rows (2026-08-11)

  Two issues found from a direct report against the live site:

  1. The real, already-seeded "Branding & Design" service row said "Logos,
     brand kits, posters, reels and video production" -- a capability
     that isn't actually offered. This claim was spread further than
     just this one row (hero copy, SEO keywords/FAQ schema, a fallback
     testimonial, a team title, the internal training manual) -- all of
     those were fixed directly in their source files in this same
     commit. This migration is the one piece that lives in the database
     rather than in code.

  2. Separately: highlights and best_for (added in two earlier
     migrations) were only ever wired into the CMS *insert* form and the
     hardcoded fallback array. The six services actually seeded in the
     live database from the original init migration never got these
     fields populated, so nothing changed on the real site even after
     those migrations ran. Backfilling all six by title match, matching
     the corrected fallback content in PublicSite.tsx exactly, minus the
     video/reels claim.
*/

UPDATE services SET
  description = 'Instagram, Facebook, and YouTube growth built on a content calendar and paid promotion, not just posting and hoping.',
  highlights = ARRAY['Monthly content calendar', 'Community management & replies', 'Organic + boosted reach strategy', 'Monthly performance report'],
  best_for = 'Businesses with little to no social presence, or pages that have gone quiet and need consistent posting again.'
WHERE segment_slug = 'digital_media' AND title = 'Social Media Marketing';

UPDATE services SET
  description = 'Logos, brand kits, and posters — a consistent visual identity across everywhere your business shows up.',
  highlights = ARRAY['Logo & brand identity kit', 'Social media templates', 'Print-ready posters & banners', 'Brand colour & typography guide'],
  best_for = 'New businesses without a logo yet, or established ones whose branding looks different on every platform.'
WHERE segment_slug = 'digital_media' AND title = 'Branding & Design';

UPDATE services SET
  description = 'Google & Meta ad campaigns with tracked ROI and lead funnels — every rupee spent tied back to an actual result, not just impressions.',
  highlights = ARRAY['Google Search & Display ads', 'Meta (Instagram/Facebook) ads', 'Landing page & funnel setup', 'Weekly spend & ROI tracking'],
  best_for = 'Businesses that want measurable leads or sales now, not just brand awareness over time.'
WHERE segment_slug = 'digital_media' AND title = 'Performance Ads';

UPDATE services SET
  description = 'Our own ready-to-use products — retail billing, staff attendance and payroll, and an AI voice receptionist — live and already serving businesses today.',
  highlights = ARRAY['MyStore OS — retail billing & inventory', 'Punchly — attendance & payroll', 'Hey Nikki — AI voice receptionist', 'No custom build required to start'],
  best_for = 'Businesses that want a working tool today, not a months-long custom build.'
WHERE segment_slug = 'software' AND title = 'SaaS Products';

UPDATE services SET
  description = 'Web apps, mobile apps, and business automation built to order when an off-the-shelf product doesn''t fit what you actually need.',
  highlights = ARRAY['Web apps (React, TypeScript)', 'Android & iOS mobile apps', 'Custom business automation', '100% on-time delivery track record'],
  best_for = 'Businesses with a workflow specific enough that no existing product quite fits it.'
WHERE segment_slug = 'software' AND title = 'Custom Software';

UPDATE services SET
  description = 'AI voice bots, chatbots, and workflow automation for businesses whose enquiries are outpacing what their team can personally answer.',
  highlights = ARRAY['AI voice calling agents', 'WhatsApp chatbot integration', '24/7 lead qualification', 'Appointment booking automation'],
  best_for = 'Businesses missing calls or messages after hours, or a team that can''t keep up with enquiry volume.'
WHERE segment_slug = 'software' AND title = 'AI Solutions';
