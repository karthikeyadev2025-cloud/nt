import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { cachedQuery } from './cachedQuery';
import type { Segment } from './database.types';

const DEFAULT_FALLBACK_SEGMENTS: Segment[] = [
  {
    id: 'seg-dm',
    slug: 'digital_media',
    name: 'Digital Marketing',
    tagline: 'Performance Ads, Social Media & Brand Growth',
    description: '',
    icon: 'Megaphone',
    color: '#ec4899',
    ticket_prefix: 'DM',
    active: true,
    order_index: 1, created_at: null,
  },
  {
    id: 'seg-soft',
    slug: 'software',
    name: 'Nikki Software Studio',
    tagline: 'Custom Web Apps, Mobile Apps & Enterprise Systems',
    description: '',
    icon: 'Code2',
    color: '#0284c7',
    ticket_prefix: 'SW',
    active: true,
    order_index: 2, created_at: null,
  },
  {
    id: 'seg-compliance',
    slug: 'business_compliance',
    name: 'Business Compliance',
    tagline: 'Company Registration, GST, Licensing & Compliance',
    description: '',
    icon: 'Shield',
    color: '#059669',
    ticket_prefix: 'BC',
    active: true,
    order_index: 3, created_at: null,
  },
];

/**
 * Nikki Technologies exited the CCTV vertical, but old rows may still be
 * present in `segments` and in `site_content` copy. Rather than repeating
 * this substring check inline in four different files (which is how it
 * drifted — the public site, the portal segment tabs and this hook each had
 * their own copy), it lives here once and everything imports it.
 *
 * This is a data-cleanup shim, not a permanent rule: once the CCTV rows are
 * removed or deactivated in the database, delete this and its call sites.
 */
export function isDiscontinuedSegment(s: { slug: string; name: string }): boolean {
  return s.slug.toLowerCase().includes('cctv') || s.name.toLowerCase().includes('cctv');
}

/**
 * Segments a person can be newly ASSIGNED to — active only.
 *
 * The admin dashboard calls useSegments(true) because it must still manage
 * work belonging to retired segments. But that same array was being handed
 * to the onboarding wizard and the Access Control edit modal as the list of
 * choices, so a retired segment appeared as a perfectly normal chip and you
 * could put a brand-new hire into a vertical the company had shut down.
 *
 * `alreadyAssigned` keeps any retired slug a person is CURRENTLY on visible,
 * so editing someone doesn't silently strip their existing access.
 */
export function assignableSegments(segments: Segment[], alreadyAssigned: string[] = []): Segment[] {
  return segments.filter(s => s.active !== false || alreadyAssigned.includes(s.slug));
}

export function useSegments(includeRetired = false) {
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_FALLBACK_SEGMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const cacheKey = `app_segments:${includeRetired}`;

    cachedQuery(cacheKey, async () => {
      let q = supabase.from('segments').select('*');
      if (!includeRetired) q = q.eq('active', true);
      const { data, error } = await q.order('order_index');
      if (error) throw error;
      return data || [];
    }).then(data => {
      if (!mounted) return;
      if (data && data.length > 0) {
        const cleanSegments = (data as Segment[]).filter(s => !isDiscontinuedSegment(s));
        setSegments(cleanSegments.length > 0 ? cleanSegments : DEFAULT_FALLBACK_SEGMENTS);
      } else {
        setSegments(DEFAULT_FALLBACK_SEGMENTS);
      }
    }).catch(() => {
      if (mounted) setSegments(DEFAULT_FALLBACK_SEGMENTS);
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [includeRetired]);

  return { segments, loading };
}

export function useSiteContent() {
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    cachedQuery('site_content_data', async () => {
      const { data, error } = await supabase.from('site_content').select('*');
      if (error) throw error;
      return data || [];
    }).then(data => {
      if (!mounted) return;
      if (data) {
        const organized: Record<string, Record<string, string>> = {};
        data.forEach((item: { section: string; key: string; value: string }) => {
          if (!organized[item.section]) organized[item.section] = {};
          let cleanedVal = item.value;
          if (/cctv/i.test(cleanedVal)) {
            cleanedVal = cleanedVal
              .replace(/cctv\s*•?\s*/gi, '')
              .replace(/security surveillance,?\s*/gi, '')
              .replace(/cctv installation,?\s*/gi, '')
              .trim();
          }
          organized[item.section][item.key] = cleanedVal;
        });
        setContent(organized);
      }
    }).catch(() => {}).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  return { content, loading };
}
