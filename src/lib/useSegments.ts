import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Segment } from './database.types';

/**
 * Segments for a given surface.
 *
 * `includeRetired` must be TRUE in staff/admin contexts: retiring a segment
 * hides it from the public website, but its existing staff, leads and tickets
 * still exist and must remain manageable while they're wound down. Filtering
 * them out of admin views strands that data with no tab to display it in.
 *
 * The public site passes nothing (defaults to active-only), so a retired
 * segment disappears from the website immediately, as intended.
 */
const DEFAULT_FALLBACK_SEGMENTS: Segment[] = [
  {
    id: 'seg-kt',
    slug: 'digital-marketing',
    name: 'Kite & Tail Media',
    tagline: 'Digital Media Marketing, Performance PPC & Social Growth',
    icon: 'Rocket',
    color: '#1d4ed8',
    active: true,
    order_index: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 'seg-soft',
    slug: 'software-development',
    name: 'Nikki Software Studio',
    tagline: 'Custom Web Apps, Mobile Apps & Enterprise Systems',
    icon: 'Code',
    color: '#0284c7',
    active: true,
    order_index: 2,
    created_at: new Date().toISOString(),
  },
];

export function useSegments(includeRetired = false) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = supabase.from('segments').select('*');
    if (!includeRetired) q = q.eq('active', true);
    q.order('order_index').then(({ data }) => {
      if (data && data.length > 0) {
        setSegments(data as Segment[]);
      } else {
        setSegments(DEFAULT_FALLBACK_SEGMENTS);
      }
      setLoading(false);
    });
  }, [includeRetired]);

  return { segments, loading };
}

export function useSiteContent() {
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('site_content').select('*').then(({ data }) => {
      if (data) {
        const organized: Record<string, Record<string, string>> = {};
        data.forEach((item: { section: string; key: string; value: string }) => {
          if (!organized[item.section]) organized[item.section] = {};
          organized[item.section][item.key] = item.value;
        });
        setContent(organized);
      }
      setLoading(false);
    });
  }, []);

  return { content, loading };
}
