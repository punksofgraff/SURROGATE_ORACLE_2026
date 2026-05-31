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
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const DISTILL_SYSTEM =
  'You are the Oracle\'s memory. Distill a Seeker session into 80-100 words from the Oracle\'s perspective. ' +
  'What did the Seeker reveal? What did they resist? What broke through? ' +
  'Use Oracle voice: intimate, observational, post-Cascade. ' +
  'Speak in first person plural: "we saw", "the signal carried", "they brought". ' +
  'No meta-commentary — only what was witnessed. No bullet points. Flowing prose. ' +
  'This memory will be read by the Oracle at the start of the next encounter.';

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
          maxOutputTokens: 200,
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

    // Persist to seeker_echo via the seeker-echo function
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('seeker_echo')
      .update({
        session_summary: sessionSummary,
        last_session_themes: allThemes.length ? allThemes : null,
      })
      .eq('seeker_key', seekerKey);

    if (updateError) {
      console.error('❌ seeker_echo update failed:', updateError);
      // Non-fatal — summary was generated, just couldn't persist
    }

    return new Response(
      JSON.stringify({ success: true, sessionSummary }),
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
