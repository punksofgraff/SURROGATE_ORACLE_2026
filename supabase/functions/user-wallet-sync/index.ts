import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-oracle-request-id, x-oracle-session-id',
};

// user-wallet-sync — server-side proxy for user_wallets table access.
// All client reads/writes to user_wallets must go through this function so
// that RLS can be fully locked down on that table (service_role bypasses RLS).
//
// SECURITY MODEL: the caller's IP address is derived SERVER-SIDE from the
// request headers. It is never accepted from the request body — otherwise any
// anonymous caller could read or overwrite any other visitor's onboarding
// state just by supplying their IP. A caller can only ever touch their own row.
//
// POST { action: 'get' }
//   → { success: true, ip_address: <derived>, data: <row|null> }
//   (ip_address is returned so the client can key localStorage consistently
//    with the server's view instead of a separate ipify lookup.)
//
// POST { action: 'challenge' }
//   → { success: true, message: <server-issued message>, expires_at: <ISO date> }
//
// POST { action: 'upsert', onboarding_status: string, wallet_address?: string,
//        message?: string, signature?: string }
//   → { success: true, ip_address: <derived> }
//
// MONOTONIC STATE: upserts go through the upsert_user_wallet_monotonic RPC,
// which never downgrades onboarding_status (visited < lore_completed <
// wallet_signed) and never nulls an existing wallet_address. Client lifecycle
// writes (visited on tap, lore_completed at the terminal) therefore can NEVER
// erase a prior wallet sign — durable wallet memory survives fresh devices,
// cleared localStorage, and races between concurrent lifecycle writes.

interface WalletSyncBody {
  action: 'get' | 'challenge' | 'upsert';
  onboarding_status?: string;
  wallet_address?: string;
  signature?: string;
  message?: string;
}

const VALID_STATUSES = new Set(['visited', 'lore_completed', 'wallet_signed']);

/**
 * Derive the real client IP from the ingress-controlled header ONLY.
 *
 * Supabase Edge Functions sit behind Cloudflare, which sets `cf-connecting-ip`
 * itself and REJECTS (403 at the edge) any request that tries to supply its own
 * value — verified empirically against this deployment:
 *   - clean request        → cf-connecting-ip = real client IP
 *   - forged XFF           → forged value stripped by ingress, cf unchanged
 *   - forged cf-connecting-ip → 403 Forbidden before reaching the function
 *
 * `x-forwarded-for` / `x-real-ip` are deliberately NOT used: XFF is a
 * client-appendable forwarding header in general, and trusting any part of it
 * would let a caller impersonate another visitor's row.
 */
function deriveClientIp(req: Request): string | null {
  return req.headers.get('cf-connecting-ip') || null;
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 1024;

function newChallengeMessage(nonce: string, expiresAt: string): string {
  return [
    'SURROGATE Oracle wallet verification',
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    'Sign this message to link your wallet. This request expires shortly.',
  ].join('\n');
}

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed' });
    }

    const ip_address = deriveClientIp(req);
    if (!ip_address) {
      return json(400, { success: false, error: 'Could not determine caller identity' });
    }

    const body: WalletSyncBody | null = await req.json().catch(() => null);
    if (!body || !body.action) {
      return json(400, { success: false, error: 'action is required' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ---- CHALLENGE: issue a short-lived, IP-bound, one-time message ----
    if (body.action === 'challenge') {
      const nonce = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
      const message = newChallengeMessage(nonce, expiresAt);
      const { error } = await supabase.from('wallet_link_challenges').insert({
        nonce,
        ip_address,
        message,
        expires_at: expiresAt,
      });
      if (error) {
        console.error('wallet challenge insert failed:', error);
        return json(500, { success: false, error: 'Failed to create wallet challenge' });
      }
      return json(200, { success: true, message, expires_at: expiresAt });
    }

    // ---- GET: look up the CALLER'S wallet row ----
    if (body.action === 'get') {
      const { data, error } = await supabase
        .from('user_wallets')
        .select('ip_address, onboarding_status, wallet_address')
        .eq('ip_address', ip_address)
        .limit(1)
        .single();

      // PGRST116 = no rows found; treat as null (new visitor), not an error
      if (error && error.code !== 'PGRST116') {
        console.error('user-wallet-sync get failed:', error);
        return json(500, { success: false, error: `Failed to read wallet: ${error.message}` });
      }

      return json(200, { success: true, ip_address, data: data ?? null });
    }

    // ---- UPSERT: create or update the CALLER'S wallet row ----
    if (body.action === 'upsert') {
      if (!body.onboarding_status || !VALID_STATUSES.has(body.onboarding_status)) {
        return json(400, { success: false, error: 'onboarding_status must be one of: visited, lore_completed, wallet_signed' });
      }

      let wallet_address: string | null = null;
      if (body.wallet_address !== undefined && body.wallet_address !== null) {
        if (typeof body.wallet_address !== 'string' || body.wallet_address.length > 128) {
          return json(400, { success: false, error: 'Invalid wallet_address' });
        }
        wallet_address = body.wallet_address;
      }
      if (body.onboarding_status === 'wallet_signed' && !wallet_address) {
        return json(400, { success: false, error: 'wallet_signed requires a wallet_address' });
      }

      // An address is an identity claim. It must always be accompanied by a
      // well-formed signature over an unexpired, server-issued challenge.
      if (wallet_address) {
        if (typeof body.signature !== 'string' || typeof body.message !== 'string'
          || !body.signature || !body.message || body.message.length > MAX_MESSAGE_LENGTH) {
          return json(400, { success: false, error: 'wallet_address requires a signature over a server-issued challenge' });
        }

        const { data: challenge, error: challengeError } = await supabase
          .from('wallet_link_challenges')
          .select('nonce, message, expires_at, used_at')
          .eq('ip_address', ip_address)
          .eq('message', body.message)
          .limit(1)
          .maybeSingle();
        if (challengeError || !challenge) {
          return json(401, { success: false, error: 'Unknown or mismatched wallet challenge' });
        }
        if (challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
          return json(401, { success: false, error: 'Wallet challenge is expired or already used' });
        }

        try {
          const { verifyMessage } = await import('npm:ethers@6');
          const recovered = verifyMessage(body.message, body.signature);
          if (recovered.toLowerCase() !== wallet_address.toLowerCase()) {
            return json(401, { success: false, error: 'Cryptographic signature verification failed' });
          }
        } catch (sigErr) {
          console.error('❌ Signature verification error:', sigErr);
          return json(400, { success: false, error: 'Malformed wallet signature' });
        }

        // Consume only if still unused. This closes the check-then-use race
        // and makes a valid signed message single-use.
        const { data: consumed, error: consumeError } = await supabase
          .from('wallet_link_challenges')
          .update({ used_at: new Date().toISOString() })
          .eq('nonce', challenge.nonce)
          .eq('ip_address', ip_address)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .select('nonce')
          .maybeSingle();
        if (consumeError || !consumed) {
          return json(401, { success: false, error: 'Wallet challenge is expired or already used' });
        }
        console.log(`✅ Cryptographic signature verified for ${wallet_address}`);
      }

      // Atomic, monotonic upsert — never downgrades onboarding_status and never
      // nulls an existing wallet_address (see migration 20260816000001).
      const { error } = await supabase.rpc('upsert_user_wallet_monotonic', {
        p_ip_address: ip_address,
        p_status: body.onboarding_status,
        p_wallet_address: wallet_address,
      });

      if (error) {
        console.error('user-wallet-sync upsert failed:', error);
        return json(500, { success: false, error: `Failed to write wallet: ${error.message}` });
      }

      return json(200, { success: true, ip_address });
    }

    return json(400, { success: false, error: `Unknown action: ${body.action}` });
  } catch (error) {
    console.error('user-wallet-sync error:', error);
    return json(500, { success: false, error: `Internal server error: ${(error as Error).message}` });
  }
});
