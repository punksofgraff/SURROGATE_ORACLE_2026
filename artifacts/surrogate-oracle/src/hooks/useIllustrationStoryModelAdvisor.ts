import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { IllustrationStoryModelOption } from '../lib/creativeProduction';

export type StoryModelRecommendation = IllustrationStoryModelOption & {
  reason: string;
  fit: 'low' | 'medium' | 'high';
};

export function useIllustrationStoryModelAdvisor() {
  const [recommendations, setRecommendations] = useState<StoryModelRecommendation[]>([]);
  const [summary, setSummary] = useState('');
  const [isAdvising, setIsAdvising] = useState(false);

  const advise = useCallback(async (brief: string): Promise<StoryModelRecommendation[]> => {
    setIsAdvising(true);
    try {
      const { data, error } = await supabase.functions.invoke('oracle-story-model-advisor', {
        body: { brief },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Co-pilot could not advise on the FAL lane.');
      const next = Array.isArray(data.recommendations)
        ? data.recommendations as StoryModelRecommendation[]
        : [];
      setRecommendations(next);
      setSummary(typeof data.summary === 'string' ? data.summary : '');
      return next;
    } finally {
      setIsAdvising(false);
    }
  }, []);

  return { recommendations, summary, isAdvising, advise };
}