import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Segment } from './database.types';

export function useSegments() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('segments')
      .select('*')
      .eq('active', true)
      .order('order_index')
      .then(({ data }) => {
        if (data) setSegments(data as Segment[]);
        setLoading(false);
      });
  }, []);

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
