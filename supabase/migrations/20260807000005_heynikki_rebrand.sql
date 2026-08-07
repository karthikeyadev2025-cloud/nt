/*
  # Hey Nikki rebrand — products table (2026-08-07)

  The product seeded as slug='jovio' ("Jovio AI Voice") was rebranded —
  the voice agent now self-identifies as "Hey Nikki," parent company
  Nikki Technologies. Domain changed to heynikki.in.

  This was reportedly already edited once via the Access Control > 
  Products manager in the Super Admin dashboard, but "Jovio" was still
  showing up elsewhere on the site. That's because the public site pulls
  product copy from three independent places that don't share data:
  this table (what Super Admin actually edits), a hardcoded fallback
  array in PublicSite.tsx (only used if this table's query fails or is
  empty), and static marketing strings in seo.ts. Editing this table
  alone was never going to fix the other two — this migration handles
  the table; the other two are fixed directly in their source files in
  the same commit as this migration.

  UPDATE, not a fresh INSERT — idempotent either way: if the Super Admin
  edit already applied some of these fields, this just confirms them;
  if it didn't stick, this sets them correctly. Deliberately does NOT
  change the slug itself ('jovio') — an internal identifier, changing it
  risks breaking anything that references this row by slug.
*/

UPDATE products SET
  name = 'Hey Nikki',
  tagline = 'Telugu AI Voice Receptionist',
  description = 'AI-powered voice receptionist that answers business calls in Telugu and English — books appointments, answers FAQs, 24/7.',
  external_url = 'https://heynikki.in',
  updated_at = now()
WHERE slug = 'jovio';
