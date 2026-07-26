export const seoConfig = {
  siteName: 'Nikki Technologies - Digital Marketing & Software Development Company',
  siteUrl: 'https://nikkitechnologies.com',
  defaultTitle: 'Nikki Technologies | Digital Marketing & Software Development Company in India',
  defaultDescription:
    'Nikki Technologies is a digital marketing and software development company serving businesses across India. Social media marketing, performance ads, branding, custom software, mobile apps and SaaS products — MyStore OS, Punchly and Jovio AI. Free consultation.',

  keywords: [
    // Brand
    'Nikki Technologies', 'nikkitechnologies.com', 'Nikki Tech',

    // ── Digital Marketing (national + key metros) ──
    'digital marketing agency India', 'digital marketing company India',
    'best digital marketing agency in India', 'social media marketing agency India',
    'performance marketing agency India', 'online marketing company India',
    'digital marketing services for small business India',
    'Instagram marketing agency', 'Facebook ads agency India', 'Google Ads agency India',
    'Meta ads management India', 'PPC agency India', 'SEO services India',
    'SEO company India', 'local SEO services India',
    'branding agency India', 'logo design services India', 'brand identity design India',
    'video production company India', 'reels production agency', 'content marketing agency India',
    'social media management services India', 'influencer marketing agency India',
    'lead generation agency India', 'ecommerce marketing agency India',
    'digital marketing agency Hyderabad', 'digital marketing agency Bangalore',
    'digital marketing agency Chennai', 'digital marketing agency Mumbai',
    'digital marketing agency Delhi', 'digital marketing agency Pune',
    'digital marketing agency Telangana', 'digital marketing agency Andhra Pradesh',

    // ── Software Development & SaaS (national) ──
    'software development company India', 'custom software development India',
    'software company for small business India', 'bespoke software development India',
    'web development company India', 'website development services India',
    'mobile app development company India', 'Android app development India',
    'iOS app development India', 'React development company India',
    'SaaS development company India', 'SaaS products India', 'B2B SaaS India',
    'business automation software India', 'workflow automation India',
    'ERP software for small business India', 'CRM software India',
    'billing software India', 'GST billing software India',
    'retail billing software India', 'POS software India',
    'attendance software India', 'payroll software India',
    'HR management software India', 'employee attendance app India',
    'AI voice bot India', 'AI chatbot development India', 'AI automation services India',
    'Telugu AI voice assistant',
    'software development company Hyderabad', 'software company Bangalore',
    'app development company Hyderabad',

    // ── Products ──
    'MyStore OS', 'MyStore OS billing software', 'Punchly', 'Punchly attendance app',
    'Jovio AI', 'Jovio voice receptionist',
  ],

  contact: {
    phone: '+91 00000 00000',
    whatsapp: '+91 00000 00000',
    email: 'info@nikkitechnologies.com',
    address: 'Hyderabad, Telangana, India',
  },

  social: { facebook: '', instagram: '', youtube: '', linkedin: '' },

  // Physical base stays Hyderabad (required for Google Business Profile and local
  // trust signals) while areaServed below tells search engines the service area
  // is all of India.
  geo: { region: 'IN', placename: 'India', latitude: 17.385, longitude: 78.4867 },

  organization: {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Nikki Technologies',
    url: 'https://nikkitechnologies.com',
    logo: 'https://nikkitechnologies.com/logo.png',
    image: 'https://nikkitechnologies.com/og-image.jpg',
    description:
      'Digital marketing and software development company serving businesses across India. Social media marketing, performance advertising, branding, custom software, mobile apps and SaaS products.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Hyderabad',
      addressRegion: 'Telangana',
      addressCountry: 'IN',
    },
    // Country-level service area — this is what tells Google you serve all of India.
    areaServed: {
      '@type': 'Country',
      name: 'India',
    },
    knowsAbout: [
      'Digital Marketing', 'Social Media Marketing', 'Search Engine Optimization',
      'Performance Advertising', 'Branding', 'Video Production',
      'Custom Software Development', 'Web Development', 'Mobile App Development',
      'SaaS', 'Business Automation', 'Artificial Intelligence',
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: [
        {
          '@type': 'OfferCatalog',
          name: 'Digital Marketing',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Social Media Marketing', description: 'Instagram, Facebook and YouTube growth with content calendars and paid campaigns.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Performance Advertising', description: 'Google and Meta ad campaigns with tracked ROI and lead funnels.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Branding & Design', description: 'Logos, brand kits, creatives and video production.' } },
          ],
        },
        {
          '@type': 'OfferCatalog',
          name: 'Software Solutions',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Custom Software Development', description: 'Web applications, mobile apps and business automation built to order.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'MyStore OS', applicationCategory: 'BusinessApplication', description: 'Multi-tenant retail and service billing platform with GST invoicing and inventory.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'Punchly', applicationCategory: 'BusinessApplication', description: 'Attendance and payroll SaaS with selfie and GPS check-in.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'Jovio AI', applicationCategory: 'BusinessApplication', description: 'AI voice receptionist answering business calls in Telugu and English.' } },
          ],
        },
      ],
    },
  },
};
