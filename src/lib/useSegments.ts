import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Segment } from './database.types';

const DEFAULT_FALLBACK_SEGMENTS: Segment[] = [
  {
    id: 'seg-kt',
    slug: 'digital-marketing',
    name: 'Kite & Tail Media',
    tagline: 'Digital Media Marketing, Performance PPC & Social Growth',
    description: '',
    icon: 'Rocket',
    color: '#1d4ed8',
    ticket_prefix: 'NKT-DM',
    active: true,
    order_index: 1,
  },
  {
    id: 'seg-soft',
    slug: 'software-development',
    name: 'Nikki Software Studio',
    tagline: 'Custom Web Apps, Mobile Apps & Enterprise Systems',
    description: '',
    icon: 'Code',
    color: '#0284c7',
    ticket_prefix: 'NKT-SW',
    active: true,
    order_index: 2,
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

    // Supabase's builder is thenable but not a real Promise, so we wrap it once.
    Promise.resolve(q.order('order_index')).then(
      ({ data, error }) => {
        if (!mounted) return;
        if (data && data.length > 0 && !error) {
          setSegments(data as Segment[]);
        } else {
          setSegments(DEFAULT_FALLBACK_SEGMENTS);
        }
      },
      () => {
        if (mounted) setSegments(DEFAULT_FALLBACK_SEGMENTS);
      },
    ).finally(() => {
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

    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 300);

    Promise.resolve(supabase.from('site_content').select('*')).then(
      ({ data, error }) => {
        if (!mounted) return;
        if (data && !error) {
          const organized: Record<string, Record<string, string>> = {};
          data.forEach((item: { section: string; key: string; value: string }) => {
            if (!organized[item.section]) organized[item.section] = {};
            organized[item.section][item.key] = item.value;
          });
          setContent(organized);
        }
      },
      () => {
        // Keep empty object fallback
      },
    ).finally(() => {
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
