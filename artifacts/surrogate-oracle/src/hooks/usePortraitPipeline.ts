/**
 * usePortraitPipeline.ts
 *
 * Enterprise-grade hook for managing the neural portrait generation pipeline.
 * Coordinates Gemini prompt enrichment, DALL-E/Replicate generation, and Supabase storage.
 */
import { useState, useCallback, useRef } from 'react';
import { logStep } from '../components/OracleStepLogger';

interface UsePortraitPipelineProps {
  currentUserId?: string | null;
  currentSessionId?: string | null;
  onPortraitGenerated?: (url: string) => void;
}

export function usePortraitPipeline({
  currentUserId,
  currentSessionId,
  onPortraitGenerated,
}: UsePortraitPipelineProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestPortraitUrl, setLatestPortraitUrl] = useState<string | null>(null);
  const conversationThemesRef = useRef<Set<string>>(new Set());

  const generatePortrait = useCallback(async (themes: string[]) => {
    setIsGenerating(true);
    logStep('GENERATING PORTRAIT...', 'pending');
    
    try {
      const { supabase } = await import('../lib/supabase');
      const safeThemes = themes.length > 0 ? themes : ['oracle', 'cyberpunk', 'graffiti'];
      
      logStep('INVOKING PORTRAIT EFA', 'pending');
      const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
        body: {
          themes: safeThemes,
          userId: currentUserId || undefined,
          sessionId: currentSessionId || undefined,
          enhancePrompt: true,
        },
      });

      if (error) throw error;
      if (!data?.imageUrl) throw new Error('No imageUrl returned from generator');

      logStep('NEURAL PORTRAIT SYNTHESIZED ✓', 'ok');
      setLatestPortraitUrl(data.imageUrl);
      onPortraitGenerated?.(data.imageUrl);
    } catch (err) {
      console.error('Portrait generation failed:', err);
      logStep('PORTRAIT GENERATION FAILED', 'err');
    } finally {
      setIsGenerating(false);
    }
  }, [currentUserId, currentSessionId, onPortraitGenerated]);

  const addThemes = useCallback((themes: string[]) => {
    themes.forEach(t => conversationThemesRef.current.add(t));
  }, []);

  const getThemes = useCallback(() => {
    return Array.from(conversationThemesRef.current);
  }, []);

  return {
    isGenerating,
    latestPortraitUrl,
    generatePortrait,
    addThemes,
    getThemes,
  };
}
