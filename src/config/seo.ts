/*
  # SEO config — worldwide (2026-08-06)

  Rewritten from an India-only baseline to a genuine multi-region config.

  1. Static constants (siteUrl, defaults)
  2. Keyword bank — grouped by market (India / UAE / UK / US / global)
  3. Per-page configs — homepage, digital marketing, software dev, products,
     careers, contact — each with region-tuned titles/descriptions
  4. Schema helpers — Organization, Service, JobPosting, Breadcrumb
  5. Regional alternates (hreflang) so Google routes UK searchers correctly

  Design notes for future editors:
  • Keywords are for humans and legacy bots. Google largely ignores <meta
    keywords> now, but Yandex, Baidu, and social-share scrapers still use it.
  • Real ranking comes from title + h1 match, structured data, and content
    depth. This file wires up the technical foundation; content quality
    (blog posts, case studies) is a separate, ongoing effort.
  • Every page gets a canonical URL and hreflang alternates declared in
    initial HTML (index.html carries a copy) for Googlebot's first pass.
*/

export const SITE_URL = 'https://nikkitechnologies.com';
export const SITE_NAME = 'Nikki Technologies';
export const PARENT_ORG = 'K² Adexos Global Technologies';
export const CONTACT_EMAIL = 'support@nikkitechnologies.com';

export const KEYWORDS = {
  brand: [
    'Nikki Technologies', 'nikkitechnologies.com', 'Nikki Tech', 'Niki Tech',
    'Nikkitech', 'Niki Technologies', 'Nikky Tech', 'Nikky Technologies',
    'Niki Media', 'Nikki Media', 'Kite & Tail', 'Kite and Tail',
    'Kite & Tail Media', 'Kite & Tail Digital', 'Kite Tail Digital',
    'Kitetail', 'Kite Tail Media',
  ],
  india_digital_marketing: [
    'digital marketing agency India', 'digital marketing company India',
    'best digital marketing agency in India', 'social media marketing agency India',
    'performance marketing agency India', 'Google Ads agency India',
    'Meta ads agency India', 'SEO services India', 'SEO company India',
    'branding agency India', 'video production India', 'reels production agency India',
    'digital marketing agency Hyderabad', 'digital marketing agency Bangalore',
    'digital marketing agency Chennai', 'digital marketing agency Mumbai',
    'digital marketing agency Delhi', 'digital marketing agency Guntur',
    'digital marketing agency Vijayawada',
  ],
  india_software: [
    'software development company India', 'custom software development India',
    'web development company India', 'mobile app development company India',
    'SaaS development company India', 'business automation software India',
    'CRM software India', 'billing software India', 'GST billing software India',
    'attendance software India', 'payroll software India',
    'AI voice bot India', 'AI chatbot development India',
    'offshore software development India', 'nearshore development India',
    'React development company India',
  ],
  uae_digital_marketing: [
    'digital marketing agency Dubai', 'digital marketing company Dubai',
    'best SEO agency Dubai', 'social media marketing Dubai',
    'Google Ads agency Dubai', 'Meta ads agency Dubai',
    'PPC agency Dubai', 'performance marketing Dubai',
    'digital marketing agency UAE', 'digital marketing Abu Dhabi',
    'Instagram marketing agency Dubai', 'TikTok marketing agency Dubai',
    'ecommerce marketing Dubai', 'D2C brand marketing UAE',
    'lead generation Dubai', 'B2B digital marketing UAE',
    'affordable digital marketing Dubai', 'ROI marketing agency Dubai',
  ],
  uae_software: [
    'software development company Dubai', 'custom software Dubai',
    'web development company Dubai', 'mobile app development Dubai',
    'SaaS development Dubai', 'offshore development India for UAE',
    'nearshore software UAE', 'India development team Dubai',
    'affordable software development UAE', 'ecommerce development Dubai',
    'React developers Dubai', 'Flutter app development Dubai',
    'CRM development UAE', 'ERP development Dubai',
    'startup MVP Dubai', 'SaaS MVP UAE',
  ],
  uae_intent: [
    'launch business in India from Dubai',
    'expand UAE business to India',
    'India market entry consulting Dubai',
    'GCC to India business expansion',
    'Indian software team for Dubai company',
  ],
  uk_digital_marketing: [
    'digital marketing agency London', 'SEO agency London',
    'PPC agency London', 'Google Ads agency London',
    'social media marketing London', 'performance marketing London',
    'affordable digital marketing London', 'small business marketing UK',
    'ecommerce marketing London', 'B2B marketing agency UK',
    'lead generation agency London', 'Instagram marketing UK',
    'ROI-focused marketing agency London',
  ],
  uk_software: [
    'software development company London', 'custom software London',
    'web development company London', 'mobile app development London',
    'offshore development India for UK', 'nearshore India developers UK',
    'affordable software development London', 'startup MVP London',
    'SaaS MVP UK', 'React developers London',
    'Flutter developers UK', 'B2B SaaS development UK',
    'ecommerce development London', 'Shopify development India for UK',
  ],
  uk_intent: [
    'launch business in India from London',
    'expand UK business to India',
    'India market entry consulting UK',
    'Indian development team for UK startup',
    'outsource development to India from UK',
  ],
  us_digital_marketing: [
    'digital marketing agency USA', 'SEO agency USA',
    'affordable digital marketing USA', 'small business SEO USA',
    'PPC agency USA', 'social media marketing USA',
    'offshore digital marketing India for USA',
    'India-based marketing agency for USA clients',
  ],
  us_software: [
    'offshore software development India for USA',
    'nearshore India developers USA', 'affordable software India for USA',
    'startup MVP India for USA', 'SaaS development India for USA',
    'React developers India for USA', 'Flutter developers India for USA',
  ],
  global: [
    'digital marketing agency Singapore', 'software development Singapore',
    'digital marketing agency Australia', 'software development Australia',
    'offshore software development India',
    'nearshore development India', 'India developers for hire',
    'affordable software development', 'India marketing agency for global brands',
    'India SEO for global websites',
  ],
};

export const ALL_KEYWORDS = ([] as string[]).concat(
  KEYWORDS.brand, KEYWORDS.india_digital_marketing, KEYWORDS.india_software,
  KEYWORDS.uae_digital_marketing, KEYWORDS.uae_software, KEYWORDS.uae_intent,
  KEYWORDS.uk_digital_marketing, KEYWORDS.uk_software, KEYWORDS.uk_intent,
  KEYWORDS.us_digital_marketing, KEYWORDS.us_software,
  KEYWORDS.global,
);

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ['Nikki Tech', 'Kite & Tail Digital', 'Kite & Tail Media', 'Niki Tech', 'Nikkitech'],
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  image: `${SITE_URL}/og-image.jpg`,
  description:
    `${SITE_NAME} is a global digital marketing and custom software engineering firm. ` +
    'We serve clients in the UAE, UK, USA, Singapore, Australia and India — building performance ad campaigns, ' +
    'SEO strategies, custom web and mobile applications, and SaaS products. India-based delivery keeps costs ' +
    'competitive without sacrificing craft.',
  parentOrganization: { '@type': 'Organization', name: PARENT_ORG },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Hyderabad', addressRegion: 'Telangana', addressCountry: 'IN',
  },
  areaServed: [
    { '@type': 'Country', name: 'India' },
    { '@type': 'Country', name: 'United Arab Emirates' },
    { '@type': 'Country', name: 'United Kingdom' },
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'Singapore' },
    { '@type': 'Country', name: 'Australia' },
    { '@type': 'City', name: 'Dubai' },
    { '@type': 'City', name: 'Abu Dhabi' },
    { '@type': 'City', name: 'London' },
    { '@type': 'City', name: 'Hyderabad' },
    { '@type': 'City', name: 'Bangalore' },
    { '@type': 'City', name: 'Mumbai' },
    { '@type': 'City', name: 'Singapore' },
  ],
  knowsLanguage: ['en', 'ar', 'hi', 'te'],
  knowsAbout: [
    'Digital Marketing', 'Performance Advertising', 'Search Engine Optimization',
    'Social Media Marketing', 'Meta Ads', 'Google Ads', 'Reels Production',
    'Custom Software Development', 'Web Application Development', 'Mobile App Development',
    'SaaS', 'Business Automation', 'AI Chatbots', 'Offshore Development',
    'Startup MVP Development', 'Ecommerce Development',
  ],
  currenciesAccepted: 'USD, AED, GBP, EUR, SGD, INR',
  paymentAccepted: 'Wire Transfer, Credit Card, PayPal, Wise, Razorpay',
  sameAs: [
    'https://facebook.com/nikkitechnologies',
    'https://instagram.com/nikkitechnologies',
    'https://linkedin.com/company/nikkitechnologies',
    'https://youtube.com/nikkitechnologies',
    'https://twitter.com/nikkitechnologies',
  ],
};

export const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Do you work with clients outside India?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Yes. ${SITE_NAME} serves clients in the UAE (Dubai, Abu Dhabi), UK (London), USA, Singapore, ` +
              'and Australia in addition to India. We invoice in USD, AED, GBP, EUR, or SGD and accept wire transfer, ' +
              'credit card, PayPal, and Wise.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does an offshore India team compare to a local Dubai or London agency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A typical software project runs 40-60% lower in cost when built by our India team versus a comparable ' +
              'Dubai or London agency, with equivalent quality — our engineers work in a 4-6 hour timezone overlap ' +
              'with GCC clients and 3-5 hours with the UK, so daily standups fit inside normal working hours for both sides.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can you help me launch or expand my business into India?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Businesses expanding from the UAE, UK, or USA into India work with us for the market-entry digital layer: ' +
              'India-specific SEO and paid ads, localized website and app builds, GST-compliant billing systems, ' +
              'and hiring/attendance software for the India office.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are your typical project sizes and timelines?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MVPs from $8,000-$25,000 typically ship in 6-10 weeks. Mid-scope SaaS builds range $30,000-$120,000 ' +
              'over 3-6 months. Digital marketing engagements start at $1,500/month with a 3-month minimum for meaningful ' +
              'campaign learning. Every engagement starts with a free discovery call.',
      },
    },
    {
      '@type': 'Question',
      name: 'What services does Nikki Technologies provide?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Two divisions: Kite & Tail Digital handles performance marketing (Meta and Google ads, SEO, social ' +
              'content, video production). The software studio ships custom web and mobile applications, SaaS products, ' +
              'and business automation tools including MyStoreOS (retail billing), Punchly (attendance & payroll), and Hey Nikki ' +
              '(Telugu voice receptionist).',
      },
    },
  ],
};

export type PageConfig = {
  title: string;
  description: string;
  path: string;
  keywords: string[];
  ogImage?: string;
  breadcrumbs?: { name: string; path: string }[];
};

export const PAGE_CONFIGS: Record<string, PageConfig> = {
  home: {
    title: `${SITE_NAME} | Digital Marketing & Custom Software Development — India, UAE, UK, US`,
    description:
      'Global digital marketing and custom software firm. Performance ads (Meta, Google), SEO, custom web and mobile apps, and SaaS. ' +
      'India-based delivery for clients in Dubai, London, the US, Singapore, and India. From MVPs to enterprise builds.',
    path: '/',
    keywords: [...KEYWORDS.brand, ...KEYWORDS.uae_digital_marketing.slice(0, 6), ...KEYWORDS.uk_digital_marketing.slice(0, 6), ...KEYWORDS.india_software.slice(0, 6)],
  },
  digital_marketing: {
    title: `Digital Marketing Agency — Meta & Google Ads, SEO, Social | ${SITE_NAME}`,
    description:
      'ROI-focused digital marketing for businesses in Dubai, London, the US, and India. Meta and Google ad campaigns, ' +
      'SEO, social media growth, viral reels, brand identity. Transparent reporting and India-based delivery for global rates.',
    path: '/#digital-media',
    keywords: [...KEYWORDS.uae_digital_marketing, ...KEYWORDS.uk_digital_marketing, ...KEYWORDS.us_digital_marketing.slice(0, 6), ...KEYWORDS.india_digital_marketing.slice(0, 8)],
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Digital Marketing', path: '/#digital-media' }],
  },
  software: {
    title: `Custom Software & App Development — Web, Mobile, SaaS | ${SITE_NAME}`,
    description:
      'Custom software for global clients: React & TypeScript web apps, iOS and Android mobile apps, SaaS platforms, ' +
      'business automation. Offshore India delivery for UAE, UK, USA, and Singapore founders. MVPs from $8K, enterprise builds ' +
      'through six figures. Free discovery call.',
    path: '/#software',
    keywords: [...KEYWORDS.uae_software, ...KEYWORDS.uk_software, ...KEYWORDS.us_software, ...KEYWORDS.india_software.slice(0, 8)],
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Software Development', path: '/#software' }],
  },
  products: {
    title: `SaaS Products — MyStoreOS, Punchly, Hey Nikki | ${SITE_NAME}`,
    description:
      'Ready-to-use SaaS products from Nikki Technologies. MyStoreOS: GST retail billing and inventory. ' +
      'Punchly: selfie & GPS attendance with automated payroll. Hey Nikki: Telugu voice receptionist. Ideal for SMBs across India and GCC.',
    path: '/#products',
    keywords: ['MyStoreOS', 'Punchly attendance', 'Hey Nikki', 'retail billing software', 'attendance payroll software', 'AI voice receptionist Telugu', 'GST billing software India'],
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/#products' }],
  },
  careers: {
    title: `Careers — Join Nikki Technologies | Software & Marketing Jobs Hyderabad`,
    description:
      'Join our growing team. Open roles in software engineering (React, TypeScript, Flutter, Android), digital marketing ' +
      '(Meta ads, SEO, content), and design. Hyderabad-based positions plus remote. Apply now or send us a general application.',
    path: '/#careers',
    keywords: ['careers Nikki Technologies', 'software jobs Hyderabad', 'React developer jobs India', 'digital marketing jobs Hyderabad', 'jobs at Kite Tail Digital', 'remote developer jobs India'],
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Careers', path: '/#careers' }],
  },
  contact: {
    title: `Contact ${SITE_NAME} — Free Discovery Call for Marketing or Software`,
    description:
      `Talk to ${SITE_NAME} about a project. Free 30-minute discovery call for prospective clients in Dubai, London, USA, and India. ` +
      'Response within 24 hours on business days. Email, WhatsApp, or ticket-tracking form.',
    path: '/#contact',
    keywords: ['contact Nikki Technologies', 'digital marketing consultation Dubai', 'software development quote India', 'free consultation'],
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Contact', path: '/#contact' }],
  },
};

export function jobPostingSchema(job: {
  id: string; title: string; description?: string | null; requirements?: string | null;
  location?: string | null; employment_type?: string | null;
  segment_slug?: string | null;
  salary_min?: number | null; salary_max?: number | null; currency?: string | null;
  posted_at?: string | null; valid_through?: string | null;
  positions_open?: number | null;
}) {
  const salaryBase = job.salary_min || job.salary_max || undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    '@id': `${SITE_URL}/#job-${job.id}`,
    title: job.title,
    description: [job.description || '', job.requirements || ''].filter(Boolean).join('\n\n') || job.title,
    datePosted: job.posted_at || new Date().toISOString().slice(0, 10),
    validThrough: job.valid_through || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    employmentType: (job.employment_type || 'FULL_TIME').toUpperCase(),
    hiringOrganization: {
      '@type': 'Organization', name: SITE_NAME, sameAs: SITE_URL, logo: `${SITE_URL}/logo.png`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location || 'Hyderabad',
        addressRegion: 'Telangana', addressCountry: 'IN',
      },
    },
    ...(salaryBase && {
      baseSalary: {
        '@type': 'MonetaryAmount', currency: job.currency || 'INR',
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.salary_min || undefined,
          maxValue: job.salary_max || undefined,
          unitText: 'MONTH',
        },
      },
    }),
    ...(job.positions_open && job.positions_open > 1 && { totalJobOpenings: job.positions_open }),
    directApply: true,
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function serviceSchema(opts: {
  name: string; description: string;
  areaServed?: string[]; priceRange?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    provider: { '@id': `${SITE_URL}/#organization` },
    serviceType: opts.name,
    name: opts.name,
    description: opts.description,
    areaServed: (opts.areaServed || ['India', 'United Arab Emirates', 'United Kingdom', 'United States']).map(n => ({
      '@type': 'Country', name: n,
    })),
    ...(opts.priceRange && { offers: { '@type': 'Offer', priceRange: opts.priceRange } }),
  };
}

export const HREFLANG_ALTERNATES = [
  { hreflang: 'en',        href: SITE_URL },
  { hreflang: 'en-IN',     href: SITE_URL },
  { hreflang: 'en-AE',     href: SITE_URL },
  { hreflang: 'en-GB',     href: SITE_URL },
  { hreflang: 'en-US',     href: SITE_URL },
  { hreflang: 'en-SG',     href: SITE_URL },
  { hreflang: 'en-AU',     href: SITE_URL },
  { hreflang: 'x-default', href: SITE_URL },
];

export const seoConfig = {
  siteName: SITE_NAME,
  siteUrl: SITE_URL,
  defaultTitle: PAGE_CONFIGS.home.title,
  defaultDescription: PAGE_CONFIGS.home.description,
  ogTitle: `${SITE_NAME} | Global Digital Marketing & Custom Software`,
  ogDescription:
    'Performance ads, SEO, custom apps and SaaS — for clients in Dubai, London, USA, and India. ' +
    'India-based delivery at global-competitive rates.',
  keywords: ALL_KEYWORDS,
  contact: {
    phone: '+91 00000 00000',
    whatsapp: '+91 00000 00000',
    email: CONTACT_EMAIL,
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
  organization: ORGANIZATION_SCHEMA,
  faqSchema: FAQ_SCHEMA,
};
