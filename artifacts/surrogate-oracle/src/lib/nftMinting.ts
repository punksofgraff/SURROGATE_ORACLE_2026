/**
 * nftMinting.ts
 *
 * Generates the encrypted NFT claim URL by calling a Supabase Edge Function.
 * The secret never touches the browser — encryption happens server-side.
 *
 * Wallet spec: AES-256-GCM, PBKDF2-SHA256 key, token = base64url(iv:authTag:ciphertext)
 * Redirect target: https://wallet.thesurrogate.me/mint?d=<token>
 */

import { supabase } from './supabase';

/**
 * Returns the full minting redirect URL for a given portrait image URL.
 * Calls the `generate-claim-link` Edge Function which holds CLAIM_LINK_SECRET.
 */
export async function generateMintLink(imageUrl: string, _archetypeTitle?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-claim-link', {
    body: { imageUrl },
  });

  if (error || !data?.url) {
    console.warn('[nftMinting] Edge function error:', error ?? 'no url returned');
    // Graceful fallback — open wallet root so user isn't stranded
    return 'https://wallet.thesurrogate.me';
  }

  return data.url;
}
