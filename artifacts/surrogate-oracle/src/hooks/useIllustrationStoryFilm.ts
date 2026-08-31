import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { IllustrationStoryPage } from '../lib/creativeProduction';

export type IllustrationStoryFilmResult = {
  url: string;
  mediaType: 'video/mp4';
  pageCount: number;
  durationSeconds: number;
  narrationAvailable: boolean;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Story source could not be read (${response.status}).`);
  const blob = await response.blob();
  return { base64: toBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: blob.type || 'image/png' };
}

async function createNarrationAudio(script: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('oracle-filler-tts', {
      body: {
        prompt: `Read this as a warm, gentle bedtime story for a young child. Keep the pace calm and expressive. ${script}`,
      },
    });
    if (error) return null;
    if (data instanceof Blob) {
      if (!data.size) return null;
      return { base64: toBase64(new Uint8Array(await data.arrayBuffer())), mimeType: data.type || 'audio/wav' };
    }
    if (data instanceof ArrayBuffer && data.byteLength > 0) {
      return { base64: toBase64(new Uint8Array(data)), mimeType: 'audio/wav' };
    }
    if (data instanceof Uint8Array && data.byteLength > 0) {
      return { base64: toBase64(data), mimeType: 'audio/wav' };
    }
    return null;
  } catch {
    return null;
  }
}

export function useIllustrationStoryFilm() {
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const renderStory = useCallback(async (
    sheetUrls: [string, string],
    pages: IllustrationStoryPage[],
    musicUrl: string,
    onProgress?: (progress: number) => void,
  ): Promise<IllustrationStoryFilmResult> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onProgress?.(8);

    const [sheetOne, sheetTwo, music] = await Promise.all([
      urlToBase64(sheetUrls[0]),
      urlToBase64(sheetUrls[1]),
      urlToBase64(musicUrl),
    ]);
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(20);

    const narration = await createNarrationAudio(
      pages.map(page => `Page ${page.pageNumber}. ${page.narration}`).join(' '),
    );
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(30);

    const response = await fetch(`${import.meta.env.BASE_URL}api/illustration-story-stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheets: [sheetOne, sheetTwo],
        music,
        narration,
        pages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error ?? ''; } catch { /* keep status */ }
      throw new Error(detail || `FFmpeg story stitch failed (${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('FFmpeg returned an empty story film.');
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(blob);
    onProgress?.(100);
    return {
      url: objectUrlRef.current,
      mediaType: 'video/mp4',
      pageCount: pages.length,
      durationSeconds: pages.reduce((sum, page) => sum + page.durationSeconds, 0),
      narrationAvailable: Boolean(narration),
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return { renderStory, cancel };
}
