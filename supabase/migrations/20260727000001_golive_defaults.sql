/*
  # Go-live configuration defaults
  Sensible starting values so payroll and attendance work correctly from day one.
  Everything here is editable in Super Admin — these are defaults, not fixed rules.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Default shift (needed for late detection and payslip auto-fill)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO shifts (name, start_time, end_time, break_minutes, working_days,
                    grace_minutes, late_fine_type, late_fine_amount, is_active)
SELECT 'General Shift', '09:30', '18:30', 60, ARRAY[1,2,3,4,5,6], 15, 'none', 0, true
WHERE NOT EXISTS (SELECT 1 FROM shifts);

-- ═══════════════════════════════════════════════════════════════
-- 2. India public holidays 2026 (national — gazetted holidays observed
--    nationwide). Regional/optional festivals vary by state and employer,
--    so add your own in Super Admin → HR → Holidays.
--    Sundays are already excluded automatically by count_working_days().
-- ═══════════════════════════════════════════════════════════════
INSERT INTO holidays (holiday_date, name, segment_slug, is_optional) VALUES
  ('2026-01-26', 'Republic Day',            NULL, false),
  ('2026-03-04', 'Holi',                    NULL, false),
  ('2026-03-21', 'Id-ul-Fitr (Ramzan Eid)', NULL, false),
  ('2026-04-01', 'Ugadi',                   NULL, false),
  ('2026-05-01', 'May Day / Labour Day',    NULL, false),
  ('2026-05-27', 'Bakrid (Id-ul-Zuha)',     NULL, false),
  ('2026-08-15', 'Independence Day',        NULL, false),
  ('2026-08-26', 'Janmashtami',             NULL, true),
  ('2026-09-14', 'Ganesh Chaturthi',        NULL, false),
  ('2026-10-02', 'Gandhi Jayanti',          NULL, false),
  ('2026-10-20', 'Dussehra (Vijaya Dashami)', NULL, false),
  ('2026-11-08', 'Diwali',                  NULL, false),
  ('2026-12-25', 'Christmas',               NULL, false)
ON CONFLICT (holiday_date, segment_slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. Contact copy for a ticket-first business (no public phone line)
-- ═══════════════════════════════════════════════════════════════
UPDATE site_content SET value = '' WHERE section = 'contact' AND key IN ('phone','whatsapp') AND value LIKE '%00000%';

INSERT INTO site_content (section, key, value, type) VALUES
  ('contact', 'support_note', 'We handle all enquiries and support through our ticket system so nothing gets missed. Raise a ticket or use the form and we will respond quickly.', 'text')
ON CONFLICT (section, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. POSH policy deactivated by default
--    Not legally required below 10 employees. Left in the library so it can
--    be switched on later — the Internal Committee fields inside it must be
--    filled in before it is issued to anyone.
-- ═══════════════════════════════════════════════════════════════
UPDATE document_templates SET active = false WHERE doc_type = 'posh_policy';

-- ═══════════════════════════════════════════════════════════════
-- 5. Showcase own products as proof of work
--    You are currently your own client, so the homepage credibility comes
--    from the products you have actually shipped rather than third-party logos.
-- ═══════════════════════════════════════════════════════════════
UPDATE site_content SET value = 'Software we have built, shipped and run in production'
WHERE section = 'hero' AND key = 'subtitle' AND value LIKE '%CCTV%';
