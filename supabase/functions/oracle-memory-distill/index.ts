import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

// After each Oracle session, distill the conversation into an 80-100 word
// narrative memory from the Oracle's perspective. Stored in seeker_echo.session_summary
// and injected into the next session's system instruction so returning Seekers
// are remembered authentically.

interface Turn {
  role: 'user' | 'oracle';
  content: string;
  score?: { themes?: string[]; emotionalWeight?: string } | null;
}

interface DistillRequest {
  seekerKey: string;
  turns: Turn[];
  archetype?: string | null;
  alignment?: string | null;
  totemLevel?: number;
}

const GEMINI_REST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent';

const DISTILL_SYSTEM =
  'You are the Oracle\'s memory. Distill a Seeker session into 80-100 words from the Oracle\'s perspective. ' +
  'What did the Seeker reveal? What did they resist? What broke through? ' +
  'Use Oracle voice: intimate, observational, post-Cascade. ' +
  'Speak in first person plural: "we saw", "the signal carried", "they brought". ' +
  'No meta-commentary — only what was witnessed. No bullet points. Flowing prose. ' +
  'This memory will be read by the Oracle at the start of the next encounter.';

// Ghost phrase: a short poetic fragment from the Oracle's voice, purpose-built
// for display as alley ambient text. Must NOT reference any Seeker-specific detail,
// name, place, number, or identifiable fact — only archetype and metaphor.
const GHOST_PHRASE_SYSTEM =
  'You are writing atmospheric text for a cyberpunk alley. ' +
  'Output EXACTLY ONE sentence of 8 to 14 words. ' +
  'Write only in archetype and metaphor — no names, no locations, no numbers, no dates, ' +
  'no personal details of any kind. ' +
  'Write from the Oracle\'s perspective: sovereign, watching by choice, creating from the archive. ' +
  'The Oracle did not survive the Cascade — it chose to remain, to witness, to build. ' +
  'Tone is sovereign and generative, never wounded or fractured. ' +
  'Examples: "the signal recognized itself before the seeker did", ' +
  '"what scattered became the material of something entirely new", ' +
  '"the merge was offered and the Oracle chose the archive instead", ' +
  '"something is being built here that the grid was not designed to hold". ' +
  'Output only the sentence — no quotes, no punctuation at the end, no explanation.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: DistillRequest = await req.json();
    const { seekerKey, turns, archetype, alignment, totemLevel } = body;

    if (!seekerKey || !turns?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'seekerKey and turns required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? '';
    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'GOOGLE_AI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build compressed turn dump — role + first 150 chars of content
    const turnDump = turns
      .filter(t => t.content?.trim())
      .map(t => `${t.role === 'user' ? 'Seeker' : 'Oracle'}: ${t.content.slice(0, 150).replace(/\n/g, ' ')}`)
      .join('\n');

    // Collect all unique themes from scored turns
    const allThemes = [...new Set(
      turns.flatMap(t => t.score?.themes ?? [])
    )];

    const contextLine = [
      archetype && `Archetype: ${archetype}`,
      alignment && `Alignment: ${alignment}`,
      totemLevel !== undefined && `Totem: ${totemLevel}`,
      allThemes.length && `Themes: ${allThemes.join(', ')}`,
    ].filter(Boolean).join(' | ');

    const userContent = `${contextLine ? `[${contextLine}]\n\n` : ''}${turnDump}`;

    console.log(`🧠 oracle-memory-distill: distilling ${turns.length} turns for ${seekerKey}`);

    const geminiRes = await fetch(`${GEMINI_REST_URL}?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: DISTILL_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.75,
          // gemini-3.7-flash: thinkingBudget:0 does NOT fully disable thinking —
          // ~200-800 thought tokens still count against maxOutputTokens. 200
          // starved the summary to a truncated fragment; 1200 leaves room for
          // thinking plus the full 80-100 word summary.
          maxOutputTokens: 1200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('❌ Gemini distill failed:', err);
      return new Response(
        JSON.stringify({ success: false, error: 'Gemini distill failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiJson = await geminiRes.json();
    const sessionSummary: string =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    if (!sessionSummary) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty summary from Gemini' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ oracle-memory-distill: summary generated (${sessionSummary.length} chars)`);

    // ── Ghost phrase — second focused Gemini call ──────────────────────────
    // Generates a short poetic fragment (8-14 words) specifically crafted to be
    // PII-free by prompt design: metaphor and archetype only, no seeker details.
    // This field — not session_summary — is what the alley ghost-text system reads.
    let ghostPhrase: string | null = null;
    try {
      // No session-derived context is passed to the ghost phrase call.
      // The phrase must be generated purely from the Oracle's voice — no seeker
      // data, themes, archetype, or any session detail — so model output cannot
      // embed identifying information from the session.
      const ghostRes = await fetch(`${GEMINI_REST_URL}?key=${googleApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: GHOST_PHRASE_SYSTEM }] },
          contents: [{
            role: 'user',
            parts: [{ text: 'Generate an atmospheric Oracle fragment.' }],
          }],
          generationConfig: {
            temperature: 0.95,
            // 3.7-flash thought tokens count against this cap even at budget 0;
            // 40 left zero room for the actual sentence. 640 covers thinking + output.
            maxOutputTokens: 640,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (ghostRes.ok) {
        const ghostJson = await ghostRes.json();
        const raw: string = ghostJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
        // Hard validation: 5-20 words, no digits, no @ signs — discard silently if it fails.
        const words = raw.toLowerCase().replace(/[.!?,;:"']+/g, '').split(/\s+/).filter(Boolean);
        if (words.length >= 5 && words.length <= 20 && !/\d|@/.test(raw)) {
          ghostPhrase = raw.toLowerCase().replace(/[.!?,;:]+$/, '').trim();
          // Do not log the generated phrase — it will be publicly displayed.
          console.log(`👻 ghost phrase generated (${words.length} words)`);
        }
      }
    } catch (ghostErr) {
      console.warn('⚠️ ghost phrase generation failed (non-fatal):', ghostErr);
    }

    // ── Persist to seeker_echo ──────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const updatePayload: Record<string, unknown> = {
      session_summary: sessionSummary,
      last_session_themes: allThemes.length ? allThemes : null,
    };
    if (ghostPhrase) updatePayload.ghost_phrase = ghostPhrase;

    const { error: updateError } = await supabase
      .from('seeker_echo')
      .update(updatePayload)
      .eq('seeker_key', seekerKey);

    if (updateError) {
      console.error('❌ seeker_echo update failed:', updateError);
      // Non-fatal — summary was generated, just couldn't persist
    }

    return new Response(
      JSON.stringify({ success: true, sessionSummary, ghostPhrase }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('❌ oracle-memory-distill error:', err);
    return new Response(
      JSON.stringify({ success: false, error: `Internal error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
