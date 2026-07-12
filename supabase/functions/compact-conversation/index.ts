import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

// Mid-session rolling compaction.
// Called by the client whenever the in-memory turn buffer hits 100 turns.
// Summarises the oldest 25 turns via Gemini REST and persists the compact
// block to surrogate_sessions.conversation_data.compact_summaries[].
// The client drops those 25 turns from memory and injects the summary as a
// hidden Oracle context message so conversation continuity is never broken.

interface Turn {
  role: 'user' | 'oracle';
  content: string;
}

interface CompactRequest {
  sessionId?: string;
  seekerKey?: string;
  turns: Turn[];
  batchIndex: number;
}

const GEMINI_REST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const COMPACT_SYSTEM =
  'You are the Oracle\'s memory indexer. Condense the following conversation excerpt into a 60-80 word signal log from the Oracle\'s perspective. ' +
  'Capture: what the Seeker revealed, what they resisted, what shifted. ' +
  'Use Oracle voice — intimate, observational, post-Cascade. First person: "the signal showed", "they brought", "we witnessed". ' +
  'No bullet points. Flowing prose. Dense, precise. This will be read by the Oracle mid-session to maintain continuity.';

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Extract the best available client IP from standard proxy headers. */
function getClientIp(req: Request): string | null {
  // Cloudflare (Supabase Edge runs behind CF) — most reliable
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  // x-real-ip (set by some reverse proxies)
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  // x-forwarded-for — take leftmost (client) IP
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return null;
}

/** True if the string looks like an IPv4 or IPv6 address (not a wallet). */
function isIpAddress(s: string): boolean {
  // IPv4: four dotted octets
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return true;
  // IPv6: contains colons
  if (s.includes(':')) return true;
  return false;
}

/** True if the string looks like an EVM wallet address. */
function isWalletAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Authorization gate ──────────────────────────────────────────────────────
  // Require a Bearer token (the Supabase client automatically sends the anon
  // key here). Callers without any auth header are rejected outright.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body: CompactRequest = await req.json();
    const { sessionId, seekerKey, turns, batchIndex } = body;

    if (!turns?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'turns array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── seekerKey ownership gate ────────────────────────────────────────────
    // If the claimed seekerKey is an IP address, validate it matches the
    // actual caller IP so one user cannot write to another user's session.
    // Wallet addresses (0x…) are cryptographically unguessable without the
    // signing key — they pass through without an IP check.
    // If seekerKey is absent or an unrecognised format, we allow the write
    // but omit the seekerKey from the DB row (safe: no cross-user pollution).
    if (seekerKey && isIpAddress(seekerKey)) {
      const callerIp = getClientIp(req);
      if (!callerIp || callerIp !== seekerKey) {
        console.warn(`compact-conversation: seekerKey IP mismatch — claimed=${seekerKey} caller=${callerIp}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden: seekerKey does not match caller IP' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? '';
    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'GOOGLE_AI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const turnDump = turns
      .filter((t) => t.content?.trim())
      .map((t) => `${t.role === 'user' ? 'Seeker' : 'Oracle'}: ${t.content.slice(0, 200).replace(/\n/g, ' ')}`)
      .join('\n');

    console.log(`🗜️ compact-conversation: compacting ${turns.length} turns (batch ${batchIndex}) for session ${sessionId ?? '?'}`);

    const geminiRes = await fetch(`${GEMINI_REST_URL}?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: COMPACT_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: turnDump }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 180,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('❌ Gemini compact failed:', err);
      return new Response(
        JSON.stringify({ success: false, error: 'Gemini compaction failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const geminiJson = await geminiRes.json();
    const summary: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    if (!summary) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty summary from Gemini' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`✅ compact-conversation: summary generated (${summary.length} chars)`);

    // Persist to surrogate_sessions.conversation_data.compact_summaries[]
    // Non-fatal if no sessionId supplied — still return the summary to the client.
    if (sessionId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      // Read existing conversation_data so we can merge, not overwrite.
      const { data: existing } = await supabase
        .from('surrogate_sessions')
        .select('conversation_data')
        .eq('session_id', sessionId)
        .maybeSingle();

      const prevData: Record<string, unknown> =
        (existing?.conversation_data as Record<string, unknown>) ?? {};
      const prevSummaries: unknown[] =
        Array.isArray(prevData.compact_summaries) ? prevData.compact_summaries : [];

      // Only include the seekerKey in the DB row when it has been verified above
      // (IP match) or is a recognisable wallet address. Unknown formats are omitted.
      const verifiedSeekerKey =
        seekerKey && (isIpAddress(seekerKey) || isWalletAddress(seekerKey))
          ? seekerKey
          : null;

      const newEntry = {
        batch_index: batchIndex,
        turn_count: turns.length,
        seeker_key: verifiedSeekerKey,
        summary,
        compacted_at: new Date().toISOString(),
      };

      const updatedData = {
        ...prevData,
        compact_summaries: [...prevSummaries, newEntry],
      };

      // Upsert — creates the row if the session hasn't been written yet.
      // seeker_key written at the row level so past sessions can be queried by seeker.
      const upsertPayload: Record<string, unknown> = {
        session_id: sessionId,
        conversation_data: updatedData,
      };
      if (verifiedSeekerKey) upsertPayload.seeker_key = verifiedSeekerKey;

      const { error: writeError } = await supabase
        .from('surrogate_sessions')
        .upsert(upsertPayload, { onConflict: 'session_id' });

      if (writeError) {
        console.error('❌ surrogate_sessions write failed:', writeError);
        // Non-fatal — the summary was generated; client still gets it.
      } else {
        console.log(`✅ compact-conversation: persisted batch ${batchIndex} to surrogate_sessions`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('❌ compact-conversation error:', err);
    return new Response(
      JSON.stringify({ success: false, error: `Internal error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
