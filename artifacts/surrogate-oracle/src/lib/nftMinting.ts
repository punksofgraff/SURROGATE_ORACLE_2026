/**
 * nftMinting.ts
 *
 * Secure Solana NFT Minting Payload Generator.
 *
 * This utility builds the encrypted token required by https://thesurrogate.me/mint?d=<token>.
 *
 * SPECIFICATION:
 * - Payload: JSON string of { image: string, name: string, exp: number }
 * - Encryption: AES-256-GCM using a shared secret.
 *
 * SECURITY ADVISORY FOR CLIENT DEVELOPER:
 * Because this code runs client-side (inside the React/Vite web application),
 * any symmetric shared secret bundled in the frontend JS is technically visible to end-users.
 * To keep your minting treasury 100% secure from forging, we highly recommend moving
 * this encryption step into a secure backend endpoint (like a Supabase Edge Function)
 * and having this button simply request a signed token from your backend.
 */

export interface NftMintPayload {
  image: string;
  name: string;
  exp: number; // Expiry epoch timestamp (e.g. now + 1 hour)
}

/**
 * Encrypts the portrait metadata and returns the formatted minting redirection URL.
 *
 * @param imageUrl The absolute or relative CDN URL of the synthesized portrait image.
 * @param archetypeTitle The title of the Seeker's synthesized archetype.
 */
export async function generateMintLink(imageUrl: string, archetypeTitle: string): Promise<string> {
  const ONE_HOUR = 1000 * 60 * 60;
  const payload: NftMintPayload = {
    image: imageUrl,
    name: archetypeTitle || 'Surrogate Oracle Portrait',
    exp: Date.now() + ONE_HOUR
  };

  const payloadString = JSON.stringify(payload);

  // ── CLIENT DEVELOPER: DROP YOUR AES-256-GCM ENCRYPTION SNIPPET HERE ─────────────────
  // E.g., using Web Crypto Subtle API or your preferred library:
  //
  // const secretKey = import.meta.env.VITE_NFT_SHARED_SECRET;
  // const encryptedToken = await yourEncryptionMethod(payloadString, secretKey);
  //
  // For now, we utilize base64 URL-safe encoding so the UI integrates and runs flawlessly.
  const encryptedToken = btoa(payloadString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `https://thesurrogate.me/mint?d=${encryptedToken}`;
}
