import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ILLUSTRATION_STORY_FAL_MODELS,
  ILLUSTRATION_STORY_MINIMAX_MODELS,
  type IllustrationStoryModelOption,
} from '../lib/creativeProduction';

export type StoryModelRecommendation = IllustrationStoryModelOption & {
  reason: string;
  fit: 'low' | 'medium' | 'high';
};

export function useIllustrationStoryModelAdvisor() {
  const [models, setModels] = useState<IllustrationStoryModelOption[]>([
    ...ILLUSTRATION_STORY_FAL_MODELS,
    ...ILLUSTRATION_STORY_MINIMAX_MODELS,
  ]);
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
      if (!data?.success) throw new Error(data?.error ?? 'Co-pilot could not advise on the hosted story lane.');
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

  const loadCatalog = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'catalog' },
    });
     if (error || !Array.isArray(data?.models) || data.models.length === 0) {
       return [...ILLUSTRATION_STORY_FAL_MODELS, ...ILLUSTRATION_STORY_MINIMAX_MODELS];
     }
    const next = data.models as IllustrationStoryModelOption[];
    setModels(next);
    return next;
  }, []);

  return { models, recommendations, summary, isAdvising, advise, loadCatalog };
}