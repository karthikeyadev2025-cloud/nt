import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Segment } from './database.types';

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
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_FALLBACK_SEGMENTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    // Instant safety timeout: Never hang loading for more than 300ms
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 300);

    let q = supabase.from('segments').select('*');
    if (!includeRetired) q = q.eq('active', true);
    
    q.order('order_index')
      .then(({ data, error }) => {
        if (!mounted) return;
        if (data && data.length > 0 && !error) {
          setSegments(data as Segment[]);
        } else {
          setSegments(DEFAULT_FALLBACK_SEGMENTS);
        }
      })
      .catch(() => {
        if (mounted) setSegments(DEFAULT_FALLBACK_SEGMENTS);
      })
      .finally(() => {
        if (mounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, [includeRetired]);

  return { segments, loading };
}

export function useSiteContent() {
  const [content, setContent] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Instant safety timeout: Never hang loading for more than 300ms
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 300);

    supabase.from('site_content').select('*')
      .then(({ data, error }) => {
        if (!mounted) return;
        if (data && !error) {
          const organized: Record<string, Record<string, string>> = {};
          data.forEach((item: { section: string; key: string; value: string }) => {
            if (!organized[item.section]) organized[item.section] = {};
            organized[item.section][item.key] = item.value;
          });
          setContent(organized);
        }
      })
      .catch(() => {
        // Keep empty object fallback
      })
      .finally(() => {
        if (mounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  return { content, loading };
}
