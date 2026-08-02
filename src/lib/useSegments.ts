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
  // Initialize with DEFAULT_FALLBACK_SEGMENTS so the page renders full structure
  // on the very first frame without layout popping when data arrives.
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_FALLBACK_SEGMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    let q = supabase.from('segments').select('*');
    if (!includeRetired) q = q.eq('active', true);

    Promise.resolve(q.order('order_index')).then(
      ({ data, error }) => {
        if (!mounted) return;
        if (data && data.length > 0 && !error) {
          const cleanSegments = (data as Segment[]).filter(
            s => !s.slug.toLowerCase().includes('cctv') && !s.name.toLowerCase().includes('cctv')
          );
          setSegments(cleanSegments.length > 0 ? cleanSegments : DEFAULT_FALLBACK_SEGMENTS);
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    Promise.resolve(supabase.from('site_content').select('*')).then(
      ({ data, error }) => {
        if (!mounted) return;
        if (data && !error) {
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
