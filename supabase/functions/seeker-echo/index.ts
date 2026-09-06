import { createClient } from 'npm:@supabase/supabase-js@2';

function getTrustedClientIp(req: Request): string | null {
  const value = req.headers.get('cf-connecting-ip')?.trim() ?? '';
  return value && value.length <= 128 ? value : null;
}

async function resolveAllowedSeekerKeys(req: Request, supabase: any): Promise<string[]> {
  const ipAddress = getTrustedClientIp(req);
  if (!ipAddress) return [];
  const { data, error } = await supabase
    .from('user_wallets')
    .select('wallet_address')
    .eq('ip_address', ipAddress)
    .maybeSingle();
  if (error) throw error;
  const walletAddress =
    typeof data?.wallet_address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(data.wallet_address)
      ? data.wallet_address
      : null;
  return [...new Set([ipAddress, walletAddress].filter((key): key is string => Boolean(key)))];
}

function isAllowedSeekerKey(requestedKey: unknown, allowedKeys: string[]): requestedKey is string {
  return typeof requestedKey === 'string'
    && requestedKey.length > 0
    && requestedKey.length <= 128
    && allowedKeys.includes(requestedKey);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-oracle-request-id, x-oracle-session-id',
};

// Seeker Echo persistence (design §I.5 / §I.3 totem ladder).
// POST { op: 'read', seekerKey }          → { success, echo: <row|null> }
//      seekerKey is checked against the server-derived caller identity.
// POST { op: 'fragments' }               → { success, phrases: string[] }
//      → returns ghost_phrase values from recent records (no PII columns).
//        Raw session content is NEVER read or returned by this branch.
// POST { op: 'continuity' }              → sanitized prior-session context
// POST { seekerKey, name?, lastArchetype?, totemLevel?, lastCost?, alignment? }
//      → upsert: writes fields, increments visit_count, bumps last_seen_at.
//
// Note: the supabase-js client always invokes edge functions via POST, so the
// `op: 'read'` POST branch mirrors the GET read for client (functions.invoke) use.
interface SeekerEchoUpsert {
  op?: 'read' | 'upsert' | 'fragments' | 'continuity';
  seekerKey?: string;
  name?: string | null;
  handles?: string[] | null;
  lastArchetype?: string | null;
  totemLevel?: number | null;
  lastCost?: string | null;
  alignment?: string | null;
  irlContext?: string | null;
  sessionSummary?: string | null;
  lastSessionThemes?: string[] | null;
}

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const readEcho = async (seekerKey: string) => {
      console.log('👁️ Seeker Echo: reading caller-owned echo');

      const { data: echo, error } = await supabase
        .from('seeker_echo')
        .select('*')
        .eq('seeker_key', seekerKey)
        .maybeSingle();

      // PGRST116 = no rows; treat as null echo (first-timer), not an error
      if (error && error.code !== 'PGRST116') {
        console.error('❌ Seeker Echo read failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Unable to read seeker memory' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, echo: echo ?? null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    };

    // Direct GET reads are intentionally disabled. The old GET path accepted
    // an arbitrary seeker_key and exposed PII through a public URL.
    if (req.method === 'GET') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- POST: read (op:'read'), fragments (op:'fragments'), or upsert ----
    if (req.method === 'POST') {
      const body: SeekerEchoUpsert = await req.json();
      const seekerKey = body.seekerKey;

      if (body.op === 'read') {
        if (!seekerKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'seekerKey is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const allowedKeys = await resolveAllowedSeekerKeys(req, supabase);
        if (!isAllowedSeekerKey(seekerKey, allowedKeys)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await readEcho(seekerKey);
      }

      // ── op: 'fragments' — alley ghost-text pool ───────────────────────────
      // Returns ONLY the ghost_phrase column — a short poetic fragment (8-14 words)
      // that oracle-memory-distill generates with explicit instructions to contain
      // no seeker-identifying information (metaphor and archetype only).
      //
      // Raw session_summary and last_session_themes are NEVER read or transmitted
      // by this branch. ghost_phrase is safe to display publicly by construction.
      if (body.op === 'fragments') {
        const { data, error: fragErr } = await supabase
          .from('seeker_echo')
          .select('ghost_phrase')
          .not('ghost_phrase', 'is', null)
          .order('last_seen_at', { ascending: false })
          .limit(40);

        if (fragErr) {
          console.error('❌ Seeker Echo fragments fetch failed:', fragErr);
          return new Response(
            JSON.stringify({ success: false, error: fragErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Shuffle so the alley doesn't always show the same most-recent phrases.
        const all = (data ?? [])
          .map((r: { ghost_phrase: string }) => r.ghost_phrase)
          .filter(Boolean);
        const shuffled = all.sort(() => Math.random() - 0.5);

        return new Response(
          JSON.stringify({ success: true, phrases: shuffled }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── op: 'continuity' — caller-owned prior-session context ─────────────
      // The browser never supplies a seeker key for this operation. The
      // function resolves the caller's IP and any wallet mapped to that IP,
      // then returns only bounded compact summaries or short turn excerpts.
      if (body.op === 'continuity') {
        const allowedKeys = await resolveAllowedSeekerKeys(req, supabase);
        if (!allowedKeys.length) {
          return new Response(
            JSON.stringify({ success: false, error: 'Caller identity unavailable' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: sessions, error: sessionsError } = await supabase
          .from('surrogate_sessions')
          .select('session_id, conversation_data')
          .in('seeker_key', allowedKeys)
          .order('created_at', { ascending: false })
          .limit(4);

        if (sessionsError) {
          console.error('❌ Seeker continuity lookup failed:', sessionsError);
          return new Response(
            JSON.stringify({ success: false, error: 'Unable to load prior continuity' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const compactSummaries: Array<{ summary: string; compacted_at: string }> = [];
        const sessionIds: string[] = [];
        for (const row of sessions ?? []) {
          if (typeof row.session_id === 'string') sessionIds.push(row.session_id);
          const raw = (row.conversation_data as { compact_summaries?: unknown } | null)?.compact_summaries;
          if (!Array.isArray(raw)) continue;
          for (const entry of raw) {
            if (
              entry
              && typeof entry === 'object'
              && typeof (entry as { summary?: unknown }).summary === 'string'
              && typeof (entry as { compacted_at?: unknown }).compacted_at === 'string'
            ) {
              compactSummaries.push({
                summary: (entry as { summary: string }).summary.slice(0, 1200),
                compacted_at: (entry as { compacted_at: string }).compacted_at,
              });
            }
          }
        }

        compactSummaries.sort((a, b) => b.compacted_at.localeCompare(a.compacted_at));
        if (compactSummaries.length) {
          return new Response(
            JSON.stringify({
              success: true,
              compactSummaries: compactSummaries.slice(0, 4),
              rawTurns: [],
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!sessionIds.length) {
          return new Response(
            JSON.stringify({ success: true, compactSummaries: [], rawTurns: [] }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: rawTurns, error: turnsError } = await supabase
          .from('conversation_turns')
          .select('role, content, turn_index, session_id')
          .in('session_id', sessionIds)
          .order('turn_index', { ascending: false })
          .limit(20);

        if (turnsError) {
          console.error('❌ Seeker continuity turn lookup failed:', turnsError);
          return new Response(
            JSON.stringify({ success: false, error: 'Unable to load prior continuity' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            compactSummaries: [],
            rawTurns: (rawTurns ?? []).map((turn) => ({
              role: turn.role === 'user' ? 'user' : 'oracle',
              content: typeof turn.content === 'string' ? turn.content.slice(0, 120) : '',
              turn_index: typeof turn.turn_index === 'number' ? turn.turn_index : 0,
            })),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!seekerKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'seekerKey is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const allowedKeys = await resolveAllowedSeekerKeys(req, supabase);
      if (!isAllowedSeekerKey(seekerKey, allowedKeys)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('🔮 Seeker Echo: upserting caller-owned echo');

      const nowIso = new Date().toISOString();

      // Fetch existing to increment visit_count and preserve created_at.
      const { data: existing, error: fetchError } = await supabase
        .from('seeker_echo')
        .select('*')
        .eq('seeker_key', seekerKey)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Seeker Echo fetch-before-upsert failed:', fetchError);
        return new Response(
          JSON.stringify({ success: false, error: 'Unable to read seeker memory' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build the row. Only overwrite a field when a value was supplied;
      // otherwise keep what's already on record.
      const pick = <T>(next: T | null | undefined, prev: T | null | undefined): T | null =>
        next !== undefined && next !== null ? next : (prev ?? null);

      const row: Record<string, unknown> = {
        seeker_key: seekerKey,
        name: pick(body.name, existing?.name),
        // Handles: merge new ones with existing — never lose a previously known handle
        handles: (() => {
          const prev: string[] = existing?.handles ?? [];
          const next: string[] = body.handles ?? [];
          const merged = [...new Set([...prev, ...next])];
          return merged.length ? merged : null;
        })(),
        last_archetype: pick(body.lastArchetype, existing?.last_archetype),
        totem_level:
          body.totemLevel !== undefined && body.totemLevel !== null
            ? body.totemLevel
            : (existing?.totem_level ?? 0),
        last_cost: pick(body.lastCost, existing?.last_cost),
        alignment: pick(body.alignment, existing?.alignment),
        irl_context: pick(body.irlContext, existing?.irl_context),
        visit_count: existing ? (existing.visit_count ?? 1) + 1 : 1,
        session_count: existing ? (existing.session_count ?? 0) + 1 : 1,
        last_seen_at: nowIso,
        created_at: existing?.created_at ?? nowIso,
      };
      if (body.sessionSummary !== undefined) row.session_summary = body.sessionSummary;
      if (body.lastSessionThemes !== undefined) row.last_session_themes = body.lastSessionThemes;

      const { data: upserted, error: upsertError } = await supabase
        .from('seeker_echo')
        .upsert(row, { onConflict: 'seeker_key' })
        .select()
        .single();

      if (upsertError) {
        console.error('❌ Seeker Echo upsert failed:', upsertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Unable to save seeker memory' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Seeker Echo upserted successfully');

      return new Response(
        JSON.stringify({ success: true, echo: upserted }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Seeker Echo error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unable to complete seeker memory request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
