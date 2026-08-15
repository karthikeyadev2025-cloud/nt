/*
  # Business Compliance division — new third segment (2026-08-14)

  Business owner asked to add a compliance/registration services line
  (company registration, GST, licenses, ISO, trademark, ITR, annual
  filings) alongside the existing Digital Media and Software divisions.
  Following the exact same segments/services pattern already
  established for those two, rather than a special-cased table — this
  is what makes it show up automatically in the Super Admin's existing
  Services & Ticket Types CMS screen with no new admin UI needed, the
  same way the other two divisions' services are managed.
*/

INSERT INTO segments (slug, name, tagline, description, icon, color, ticket_prefix, order_index) VALUES
  ('business_compliance', 'Business Compliance', 'Company Registration, GST, Licensing & Compliance',
   'Registrations, licenses, and annual compliance filings handled by an expert CA/CS team — PAN India support, entirely online.',
   'Shield', '#059669', 'BC', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (segment_slug, title, description, icon, order_index, highlights, best_for) VALUES
  ('business_compliance', 'Company Registration',
   'Register your Private Limited, LLP, One Person Company, or Partnership — we handle the paperwork, you run the business.',
   'Building2', 1,
   ARRAY['Pvt Ltd, LLP, OPC & Partnership', 'DIN & DSC processing', 'MOA/AOA drafting', 'Bank account opening support'],
   'Founders starting a new business who want it registered correctly the first time, without chasing forms themselves.'),

  ('business_compliance', 'GST Registration & Filing',
   'GST registration and ongoing monthly/quarterly return filing, so you never miss a deadline or a notice.',
   'FileText', 2,
   ARRAY['New GST registration', 'Monthly/quarterly GSTR filing', 'Input tax credit reconciliation', 'Notice & query handling'],
   'Any business crossing the GST threshold, or already registered but tired of filing returns themselves.'),

  ('business_compliance', 'Labour License & Shop License',
   'Shops & Establishment registration and labour licenses for businesses employing staff.',
   'Briefcase', 3,
   ARRAY['Shop & Establishment Act registration', 'Labour license application', 'Renewal reminders', 'Multi-state support'],
   'Businesses hiring their first employees or opening a physical shop/office location.'),

  ('business_compliance', 'Food License (FSSAI)',
   'FSSAI registration and license for anyone manufacturing, storing, selling, or distributing food.',
   'Utensils', 4,
   ARRAY['Basic, State & Central FSSAI', 'Documentation support', 'Renewal before expiry', 'Cloud kitchens & restaurants'],
   'Restaurants, cloud kitchens, food manufacturers, and distributors who need to be legally compliant to operate.'),

  ('business_compliance', 'ISO Certification',
   'ISO 9001, 14001, and other certifications that make your business credible to bigger clients and tenders.',
   'Award', 5,
   ARRAY['ISO 9001, 14001 & more', 'Documentation & audit prep', 'Certification body coordination', 'Annual surveillance support'],
   'Businesses bidding on tenders or enterprise clients that require ISO certification as a prerequisite.'),

  ('business_compliance', 'Trademark Registration',
   'Protect your brand name and logo before someone else claims it — trademark search, filing, and objection handling.',
   'Stamp', 6,
   ARRAY['Trademark search & class selection', 'Application filing', 'Objection & opposition handling', 'Renewal tracking'],
   'Any business with a brand name or logo worth protecting from copycats.'),

  ('business_compliance', 'Trade License (GHMC)',
   'Municipal trade license from GHMC and other local bodies, required to legally operate your business premises.',
   'Landmark', 7,
   ARRAY['GHMC & municipal trade license', 'New application & renewal', 'Document preparation', 'Follow-up with the municipal office'],
   'Businesses operating from a physical premises in Hyderabad or other GHMC-governed areas.'),

  ('business_compliance', 'MSME / Udyam Registration',
   'Udyam (MSME) registration to unlock government schemes, collateral-free loans, and delayed-payment protection.',
   'Factory', 8,
   ARRAY['Udyam registration certificate', 'Access to MSME schemes', 'Collateral-free loan eligibility', 'Delayed payment protection under MSMED Act'],
   'Small and medium businesses that want access to government benefits and stronger legal footing with larger buyers.'),

  ('business_compliance', 'Income Tax Return Filing (ITR)',
   'Personal and business ITR filing by a CA team that actually checks your numbers, not just submits them.',
   'Calculator', 9,
   ARRAY['Individual & business ITR', 'Tax planning & deduction review', 'Form 16/26AS reconciliation', 'Notice response support'],
   'Business owners and professionals who want their returns filed correctly and on time, every year.'),

  ('business_compliance', 'Compliance & Annual Filing Services',
   'Annual ROC filings, statutory registers, and ongoing compliance so your company stays in good legal standing.',
   'ClipboardCheck', 10,
   ARRAY['Annual ROC filings (AOC-4, MGT-7)', 'Statutory register maintenance', 'Board resolution drafting', 'Compliance calendar & reminders'],
   'Registered companies and LLPs that need to stay compliant year-round, not just at incorporation.');
