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
    updateMetaTag('og:title', title, 'property');
    updateMetaTag('og:description', description, 'property');
    updateMetaTag('og:type', 'website', 'property');
    updateMetaTag('og:url', seoConfig.siteUrl, 'property');
    updateMetaTag('og:site_name', seoConfig.siteName, 'property');
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('geo.region', seoConfig.geo.region);
    updateMetaTag('geo.placename', seoConfig.geo.placename);
    updateMetaTag('geo.position', `${seoConfig.geo.latitude};${seoConfig.geo.longitude}`);

    let ld = document.getElementById('org-jsonld') as HTMLScriptElement | null;
    if (!ld) {
      ld = document.createElement('script');
      ld.id = 'org-jsonld';
      ld.type = 'application/ld+json';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(seoConfig.organization);
  }, [title, description]);

  return null;
}
