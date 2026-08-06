import { useEffect } from 'react';
import {
  seoConfig, SITE_URL, PAGE_CONFIGS, ORGANIZATION_SCHEMA, FAQ_SCHEMA,
  HREFLANG_ALTERNATES, breadcrumbSchema, type PageConfig,
} from '../config/seo';

interface SEOHeadProps {
  page?: keyof typeof PAGE_CONFIGS;
  title?: string;
  description?: string;
  extraSchemas?: Record<string, unknown>[];
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setJsonLd(id: string, obj: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(obj);
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function setHreflangs() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());
  HREFLANG_ALTERNATES.forEach(a => {
    const el = document.createElement('link');
    el.rel = 'alternate';
    el.hreflang = a.hreflang;
    el.href = a.href;
    document.head.appendChild(el);
  });
}

function clearExtraSchemas() {
  document.querySelectorAll('script[data-extra-schema="true"]').forEach(el => el.remove());
}

export default function SEOHead({
  page = 'home',
  title,
  description,
  extraSchemas,
}: SEOHeadProps) {
  useEffect(() => {
    const cfg: PageConfig = PAGE_CONFIGS[page] || PAGE_CONFIGS.home;
    const finalTitle = title || cfg.title;
    const finalDesc = description || cfg.description;
    const canonical = `${SITE_URL}${cfg.path === '/' ? '/' : cfg.path}`;
    const ogImage = cfg.ogImage || `${SITE_URL}/og-image.jpg`;

    document.title = finalTitle;
    setMeta('description', finalDesc);
    setMeta('keywords', cfg.keywords.join(', '));
    setMeta('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    setMeta('og:title', finalTitle, 'property');
    setMeta('og:description', finalDesc, 'property');
    setMeta('og:type', 'website', 'property');
    setMeta('og:url', canonical, 'property');
    setMeta('og:site_name', seoConfig.siteName, 'property');
    setMeta('og:locale', 'en_US', 'property');
    setMeta('og:locale:alternate', 'en_GB', 'property');
    setMeta('og:image', ogImage, 'property');
    setMeta('og:image:secure_url', ogImage, 'property');
    setMeta('og:image:width', '1200', 'property');
    setMeta('og:image:height', '630', 'property');
    setMeta('og:image:type', 'image/jpeg', 'property');
    setMeta('og:image:alt', `${seoConfig.siteName} — ${finalTitle}`, 'property');

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', finalTitle);
    setMeta('twitter:description', finalDesc);
    setMeta('twitter:image', ogImage);
    setMeta('twitter:image:alt', `${seoConfig.siteName} — ${finalTitle}`);

    setMeta('geo.region', seoConfig.geo.region);
    setMeta('geo.placename', seoConfig.geo.placename);
    setMeta('geo.position', `${seoConfig.geo.latitude};${seoConfig.geo.longitude}`);
    setMeta('ICBM', `${seoConfig.geo.latitude}, ${seoConfig.geo.longitude}`);

    setCanonical(canonical);
    setHreflangs();

    setJsonLd('org-jsonld', ORGANIZATION_SCHEMA);
    setJsonLd('faq-jsonld', FAQ_SCHEMA);

    if (cfg.breadcrumbs && cfg.breadcrumbs.length > 0) {
      setJsonLd('breadcrumb-jsonld', breadcrumbSchema(cfg.breadcrumbs));
    } else {
      document.getElementById('breadcrumb-jsonld')?.remove();
    }

    clearExtraSchemas();
    if (extraSchemas && extraSchemas.length > 0) {
      extraSchemas.forEach((schema, i) => {
        const el = document.createElement('script');
        el.type = 'application/ld+json';
        el.setAttribute('data-extra-schema', 'true');
        el.textContent = JSON.stringify(schema);
        el.id = `extra-schema-${i}`;
        document.head.appendChild(el);
      });
    }

    return () => { clearExtraSchemas(); };
  }, [page, title, description, extraSchemas]);

  return null;
}
