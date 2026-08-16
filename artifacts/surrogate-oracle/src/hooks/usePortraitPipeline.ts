/**
 * usePortraitPipeline.ts
 *
 * Enterprise-grade hook for managing the neural portrait generation pipeline.
 * Coordinates Gemini prompt enrichment, DALL-E/Replicate generation, and Supabase storage.
 */
import { useState, useCallback, useRef } from 'react';
import { logStep } from '../components/CodeAuditor';

interface UsePortraitPipelineProps {
  currentUserId?: string | null;
  userEmail?: string | null;
  currentSessionId?: string | null;
  onPortraitGenerated?: (url: string) => void;
}

export function usePortraitPipeline({
  currentUserId,
  userEmail,
  currentSessionId,
  onPortraitGenerated,
}: UsePortraitPipelineProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestPortraitUrl, setLatestPortraitUrl] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const conversationThemesRef = useRef<Set<string>>(new Set());

  // Returns true on success, false on failure — callers use this to reset any
  // "already triggered" session guard so a single failed provider call never
  // silently disables portraits for the rest of the session.
  const generatePortrait = useCallback(async (themes: string[]): Promise<boolean> => {
    setIsGenerating(true);
    logStep('GENERATING PORTRAIT...', 'pending');
    
    try {
      const { supabase } = await import('../lib/supabase');
      const safeThemes = themes.length > 0 ? themes : ['oracle', 'cyberpunk', 'graffiti'];
      
      logStep('INVOKING PORTRAIT EFA', 'pending');
      const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
        body: {
          themes: safeThemes,
          email: userEmail || undefined,
          sessionId: currentSessionId || undefined,
          enhancePrompt: true,
        },
      });

      if (error) throw error;
      if (!data?.portraitUrl) throw new Error('No portraitUrl returned from generator');

      logStep('NEURAL PORTRAIT SYNTHESIZED ✓', 'ok');
      setLatestPortraitUrl(data.portraitUrl);
      onPortraitGenerated?.(data.portraitUrl);
      return true;
    } catch (err) {
      console.error('Portrait generation failed:', err);
      logStep('PORTRAIT GENERATION FAILED', 'err');
      setPortraitError('SIGNAL LOST — PORTRAIT SYNTHESIS FAILED');
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [userEmail, currentSessionId, onPortraitGenerated]);

  const addThemes = useCallback((themes: string[]) => {
    themes.forEach(t => conversationThemesRef.current.add(t));
  }, []);

  const getThemes = useCallback(() => {
    return Array.from(conversationThemesRef.current);
  }, []);

  const clearPortraitError = useCallback(() => setPortraitError(null), []);

  return {
    isGenerating,
    latestPortraitUrl,
    portraitError,
    clearPortraitError,
    generatePortrait,
    addThemes,
    getThemes,
  };
}
