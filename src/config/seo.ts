export const seoConfig = {
  siteName: 'Nikki Technologies - Digital Marketing & Software Development Company',
  siteUrl: 'https://nikkitechnologies.com',
  defaultTitle: 'Nikki Technologies | Digital Marketing & Software Development Company in India',
  defaultDescription:
    'Nikki Technologies (Kite & Tail Digital) is India\'s top digital media marketing and custom software engineering company. Performance PPC ads, social media management, SEO, viral reels, custom web & mobile apps, and SaaS products — serving Hyderabad, Telangana, Andhra Pradesh & all India.',

  keywords: [
    // ── Brand & Misspellings Catch-All ──
    'Nikki Technologies', 'nikkitechnologies.com', 'Nikki Tech', 'Niki Tech', 'Nikkitech',
    'Niki Technologies', 'Nikky Tech', 'Nikky Technologies', 'Niki Media', 'Nikki Media',
    'Kite & Tail', 'Kite and Tail', 'Kite & Tail Media', 'Kite & Tail Digital', 'Kite Tail Digital',
    'Kitetail', 'Kite Tail Media', 'Kite & Tail Digital Marketing',

    // ── Telugu States & Regional Geo Focus (Telangana & Andhra Pradesh) ──
    'digital marketing agency Hyderabad', 'digital marketing company Hyderabad',
    'digital marketing agency Telangana', 'digital marketing agency Andhra Pradesh',
    'best digital marketing agency in Hyderabad', 'digital marketing services Visakhapatnam',
    'digital marketing company Vijayawada', 'digital marketing agency Guntur',
    'digital marketing agency Tirupati', 'digital marketing agency Warangal',
    'digital marketing agency South India', 'Telugu digital marketing agency',
    'digital marketing agency Secunderabad', 'digital marketing agency Karimnagar',
    'digital marketing agency Rajahmundry', 'digital marketing agency Kakinada',
    'software development company Hyderabad', 'software company Telangana',
    'software company Andhra Pradesh', 'web development company Hyderabad',
    'mobile app development company Hyderabad', 'app development company Visakhapatnam',
    'software company Vijayawada', 'custom software development South India',
    'software development company Secunderabad', 'IT services Hyderabad',

    // ── National Metros & Pan-India SEO ──
    'digital marketing agency India', 'digital marketing company India',
    'best digital marketing agency in India', 'social media marketing agency India',
    'performance marketing agency India', 'online marketing company India',
    'digital marketing services for small business India',
    'Instagram marketing agency India', 'Facebook ads agency India', 'Google Ads agency India',
    'Meta ads management India', 'PPC agency India', 'SEO services India',
    'SEO company India', 'local SEO services India',
    'branding agency India', 'logo design services India', 'brand identity design India',
    'video production company India', 'reels production agency India', 'content marketing agency India',
    'social media management services India', 'influencer marketing agency India',
    'lead generation agency India', 'ecommerce marketing agency India',
    'digital marketing agency Bangalore', 'digital marketing agency Chennai',
    'digital marketing agency Mumbai', 'digital marketing agency Delhi',
    'digital marketing agency Pune', 'digital marketing agency Kolkata',

    // ── Custom Software & Mobile Engineering ──
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

    // ── AI, Voice & GEO (Generative Engine Optimization) ──
    'AI voice bot India', 'AI chatbot development India', 'AI automation services India',
    'Telugu AI voice assistant', 'Jovio AI receptionist', 'MyStore OS billing software',
    'Punchly attendance app', 'AI voice bot Hyderabad',
  ],

  contact: {
    phone: '+91 00000 00000',
    whatsapp: '+91 00000 00000',
    email: 'info@nikkitechnologies.com',
    address: 'Hyderabad, Telangana, India',
  },

  social: {
    facebook: 'https://facebook.com/nikkitechnologies',
    instagram: 'https://instagram.com/nikkitechnologies',
    youtube: 'https://youtube.com/nikkitechnologies',
    linkedin: 'https://linkedin.com/company/nikkitechnologies',
  },

  geo: {
    region: 'IN-TG',
    placename: 'Hyderabad, Telangana, Andhra Pradesh, South India',
    latitude: 17.385,
    longitude: 78.4867,
  },

  // ── Schema.org Organization Graph ──
  organization: {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Nikki Technologies',
    alternateName: ['Nikki Tech', 'Kite & Tail Digital', 'Kite & Tail Media', 'Niki Tech', 'Nikkitech'],
    url: 'https://nikkitechnologies.com',
    logo: 'https://nikkitechnologies.com/logo.png',
    image: 'https://nikkitechnologies.com/og-image.jpg',
    description:
      'Nikki Technologies (Kite & Tail Digital) is a premier digital media marketing and custom software development company in India. Serving Hyderabad, Telangana, Andhra Pradesh and pan-India with ROI-focused Meta & Google PPC ads, social growth, SEO, custom web & mobile apps.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Hyderabad',
      addressRegion: 'Telangana',
      addressCountry: 'IN',
    },
    areaServed: [
      { '@type': 'State', name: 'Telangana' },
      { '@type': 'State', name: 'Andhra Pradesh' },
      { '@type': 'Country', name: 'India' },
    ],
    knowsAbout: [
      'Digital Marketing', 'Performance Advertising', 'Search Engine Optimization (SEO)',
      'Social Media Marketing', 'Meta Ads', 'Google Ads', 'Reels Production',
      'Custom Software Development', 'Web Application Development', 'Mobile App Development',
      'SaaS', 'Business Automation', 'AI Chatbots & Voice Assistants',
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Services Catalog',
      itemListElement: [
        {
          '@type': 'OfferCatalog',
          name: 'Kite & Tail Digital Marketing Division',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Meta & Google PPC Campaigns', description: 'Targeted lead generation and sales conversion ad funnels with high ROAS.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Social Media & Creative Reels', description: 'Instagram, YouTube shorts and viral reels production with content management.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'SEO & Brand Identity', description: 'Search engine ranking optimization, local SEO, and complete brand kits.' } },
          ],
        },
        {
          '@type': 'OfferCatalog',
          name: 'Software Engineering Division',
          itemListElement: [
            { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Custom Web & Mobile Development', description: 'React, TypeScript, Android & iOS bespoke applications.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'MyStore OS', applicationCategory: 'BusinessApplication', description: 'GST retail billing and POS inventory management software.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'Punchly', applicationCategory: 'BusinessApplication', description: 'Selfie & GPS attendance software with automated payroll.' } },
            { '@type': 'Offer', itemOffered: { '@type': 'SoftwareApplication', name: 'Jovio AI', applicationCategory: 'BusinessApplication', description: 'AI voice receptionist for Telugu and English business calls.' } },
          ],
        },
      ],
    },
  },

  // ── FAQ Schema for Voice Search & AI Engine Optimization (AEO / GEO) ──
  faqSchema: {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What services does Nikki Technologies provide?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Nikki Technologies provides digital media marketing through Kite & Tail Media (Meta PPC ads, Google Ads, viral reels, SEO) and custom software development (React web apps, mobile apps, SaaS tools like MyStore OS, Punchly, Jovio AI).',
        },
      },
      {
        '@type': 'Question',
        name: 'Does Nikki Technologies serve Telugu states Telangana and Andhra Pradesh?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, Nikki Technologies is headquartered in Hyderabad and serves businesses across Telangana, Andhra Pradesh, South India, and pan-India.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is Kite & Tail Media under Nikki Technologies?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Kite & Tail Media is the performance digital marketing division of Nikki Technologies, specializing in ROI-focused lead generation, PPC advertising, brand identity, and social media growth.',
        },
      },
    ],
  },
};
