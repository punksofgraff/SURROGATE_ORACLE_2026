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

  try {
    const body: CompactRequest = await req.json();
    const { sessionId, seekerKey, turns, batchIndex } = body;

    if (!turns?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'turns array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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

      const newEntry = {
        batch_index: batchIndex,
        turn_count: turns.length,
        seeker_key: seekerKey ?? null,
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
      if (seekerKey) upsertPayload.seeker_key = seekerKey;

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
