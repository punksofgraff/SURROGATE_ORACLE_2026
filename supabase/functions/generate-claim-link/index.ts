const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-oracle-request-id, x-oracle-session-id',
};

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'imageUrl required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = Deno.env.get('CLAIM_LINK_SECRET');
    if (!secret) {
      return new Response(JSON.stringify({ error: 'CLAIM_LINK_SECRET not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Derive key — PBKDF2-SHA256, 100k iterations, salt = "netzylo-claim-salt"
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('netzylo-claim-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Encrypt — WebCrypto AES-GCM appends 16-byte auth tag at end of output
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const payload = JSON.stringify({ imageUrl, exp: Date.now() + 24 * 60 * 60 * 1000 });
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload));

    const cipherArr = new Uint8Array(cipherBuf);
    const ciphertext = cipherArr.slice(0, -16);
    const authTag    = cipherArr.slice(-16);

    const toHex = (buf: Uint8Array) =>
      Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

    // Token format matches wallet spec: base64url(iv:authTag:ciphertext)
    const raw   = `${toHex(iv)}:${toHex(authTag)}:${toHex(ciphertext)}`;
    const token = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url   = `https://wallet.thesurrogate.me/mint?d=${encodeURIComponent(token)}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
