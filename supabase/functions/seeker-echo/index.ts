import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

// Seeker Echo persistence (design §I.5 / §I.3 totem ladder).
// GET  ?seeker_key=<wallet|ip>           → { success, echo: <row|null> }
// POST { op: 'read', seekerKey }          → { success, echo: <row|null> }
// POST { op: 'fragments' }               → { success, phrases: string[] }
//      → returns ghost_phrase values from recent records (no PII columns).
//        Raw session content is NEVER read or returned by this branch.
// POST { seekerKey, name?, lastArchetype?, totemLevel?, lastCost?, alignment? }
//      → upsert: writes fields, increments visit_count, bumps last_seen_at.
//
// Note: the supabase-js client always invokes edge functions via POST, so the
// `op: 'read'` POST branch mirrors the GET read for client (functions.invoke) use.
interface SeekerEchoUpsert {
  op?: 'read' | 'upsert' | 'fragments';
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
      console.log(`👁️ Seeker Echo: reading echo for ${seekerKey}`);

      const { data: echo, error } = await supabase
        .from('seeker_echo')
        .select('*')
        .eq('seeker_key', seekerKey)
        .maybeSingle();

      // PGRST116 = no rows; treat as null echo (first-timer), not an error
      if (error && error.code !== 'PGRST116') {
        console.error('❌ Seeker Echo read failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to read echo: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, echo: echo ?? null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    };

    // ---- READ via GET (?seeker_key=) ----
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const seekerKey = url.searchParams.get('seeker_key') ?? url.searchParams.get('seekerKey');

      if (!seekerKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'seeker_key is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return await readEcho(seekerKey);
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

      if (!seekerKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'seekerKey is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`🔮 Seeker Echo: upserting echo for ${seekerKey}`);

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
          JSON.stringify({ success: false, error: `Failed to read echo: ${fetchError.message}` }),
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
          JSON.stringify({ success: false, error: `Failed to write echo: ${upsertError.message}` }),
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
      JSON.stringify({ success: false, error: `Internal server error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
