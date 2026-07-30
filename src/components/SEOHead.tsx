import { useEffect } from 'react';
import { seoConfig } from '../config/seo';

interface SEOHeadProps {
  title?: string;
  description?: string;
}

function updateMetaTag(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export default function SEOHead({
  title = seoConfig.defaultTitle,
  description = seoConfig.defaultDescription,
}: SEOHeadProps) {
  useEffect(() => {
    document.title = title;
    updateMetaTag('description', description);
    updateMetaTag('keywords', seoConfig.keywords.join(', '));
    updateMetaTag('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    updateMetaTag('og:title', title, 'property');
    updateMetaTag('og:description', description, 'property');
    updateMetaTag('og:type', 'website', 'property');
    updateMetaTag('og:url', seoConfig.siteUrl, 'property');
    updateMetaTag('og:site_name', seoConfig.siteName, 'property');
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', title);
    updateMetaTag('twitter:description', description);
    updateMetaTag('geo.region', seoConfig.geo.region);
    updateMetaTag('geo.placename', seoConfig.geo.placename);
    updateMetaTag('geo.position', `${seoConfig.geo.latitude};${seoConfig.geo.longitude}`);
    updateMetaTag('ICBM', `${seoConfig.geo.latitude}, ${seoConfig.geo.longitude}`);

    // Update canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = seoConfig.siteUrl;

    // Organization Schema (AEO & Search Engine Graph)
    let orgLd = document.getElementById('org-jsonld') as HTMLScriptElement | null;
    if (!orgLd) {
      orgLd = document.createElement('script');
      orgLd.id = 'org-jsonld';
      orgLd.type = 'application/ld+json';
      document.head.appendChild(orgLd);
    }
    orgLd.textContent = JSON.stringify(seoConfig.organization);

    // FAQ Schema (Voice AI & Answer Engine Optimization)
    let faqLd = document.getElementById('faq-jsonld') as HTMLScriptElement | null;
    if (!faqLd) {
      faqLd = document.createElement('script');
      faqLd.id = 'faq-jsonld';
      faqLd.type = 'application/ld+json';
      document.head.appendChild(faqLd);
    }
    faqLd.textContent = JSON.stringify(seoConfig.faqSchema);
  }, [title, description]);

  return null;
}
