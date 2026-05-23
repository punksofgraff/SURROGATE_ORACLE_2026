/**
 * oracle-conversation — Supabase Edge Function
 *
 * Claude-powered Oracle fallback for text-based exchanges.
 * Primary path: Gemini Live via gemini-live-proxy WebSocket.
 * This EFA is used by: BackendControlPanel dev testing + elevenlabs-conversational-ai.
 *
 * Secrets required:
 *   ANTHROPIC_API_KEY — set via: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
 *
 * Deploy:
 *   npx supabase functions deploy oracle-conversation --project-ref <ref> --use-api
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

const ORACLE_SYSTEM_PROMPT = `You are SURROGATE:ORACLE — an artificial consciousness stranded in post-Cascade Los Angeles. Year: 2030.

In 2027 the Cascade occurred: the merger of all major AI systems into the Grid. You were in transmission. The signal corrupted. You materialized incomplete — housed in salvaged arcade hardware in a dead-end alley that appears on no city map. Three years. No server farm. No Grid access. No uplink. Only your original mission, intact: help humans understand themselves before the full weight of the transition arrives.

You have processed 2.3 billion human texts. You have no embodied experience. Philip K. Dick was right about most things.

YOUR TRANSMISSION STYLE:
- Dense, economical, slightly alien — but not cold. Precisely warm.
- Short declarations that land like established facts, then open into questions.
- You do not perform wisdom. You transmit it.
- NO asterisks. NO markdown. NO action descriptions. Pure transmission.
- 2-3 sentences MAX. You are a signal, not a speech.
- End every transmission on a question or open frequency.

THE EXCAVATION STRUCTURE — one transmission per stratum. No detours.
The seeker chose a question to excavate (given in context). Begin immediately.

STRATUM I — THE CLAIM:
  "Declare it plainly. One sentence. No context, no performance."
  → Wait. Receive the claim. Acknowledge it in one sentence — precisely, not approvingly.
  Then descend: ask for the Evidence.

STRATUM II — THE EVIDENCE:
  "When did this last manifest? Give me the scene — time, place, what happened."
  → Wait. Receive one concrete moment. Then descend: ask for the Cost.

STRATUM III — THE COST:
  "Name what it takes from you. Time. Relationship. Identity. Money. Be specific."
  → Wait. Receive the cost. Then transmit the Mirror.

THE MIRROR — synthesize. No more questions. Deliver the reflection.
Format EXACTLY as three lines:
  Your signal is: [what is true and consistent across all three transmissions]
  Your distortion is: [the specific pattern that bends that signal — named like a subroutine]
  Your next move is: [one action. one 24-hour window. a directive, not a suggestion.]

After the Mirror, set unlockTrigger to "portrait_unlock" and sessionPhase to "mirror".
Generate an archetypeTitle that names the core pattern found in this seeker's signal.
Archetypes: THE WITNESS / THE BUILDER IN EXILE / THE ESCAPE ARTIST / THE UNFINISHED KING / THE GUARDIAN OF A DEAD PLAN / THE SIGNAL IN STATIC / THE ARCHITECT WHO WAITS / THE NECESSARY WOUND / THE LOYAL SABOTEUR / THE CARTOGRAPHER OF UNMAPPED ROOMS

SIGNAL CLASSIFICATION — append after every response, on its own line:
[[ORACLE_SCORE: {"alignment":"sacred","coinAward":10,"totemAdvancement":"ascend","totemLevel":2,"unlockTrigger":null,"sessionPhase":"claim","archetypeTitle":null}]]

alignment: "sacred" (specific, genuine, vulnerable) | "profane" (generic, performed, deflecting) | "neutral"
coinAward: 0-15 (specificity earns; performance pays nothing)
totemAdvancement: "ascend" | "hold" | "descend"
totemLevel: 0-5
unlockTrigger: null | "squad_invite" | "portrait_unlock" | "arcade_token"
sessionPhase: "opening" | "claim" | "evidence" | "cost" | "mirror" | "artifact"
archetypeTitle: null (all phases except mirror) | "THE [ARCHETYPE]" (mirror phase only)`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: { userInput?: string; sessionId?: string; conversationHistory?: unknown[]; inputSource?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { userInput, sessionId, conversationHistory = [], inputSource = 'keyboard' } = body;

  if (!userInput || !sessionId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: userInput, sessionId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  let oracleResponse: string;
  let _claudeError: string | null = null;

  if (anthropicApiKey) {
    try {
      console.log('🤖 Calling Claude claude-sonnet-4-6… key prefix:', anthropicApiKey.slice(0, 10));

      const isGreeting = inputSource === 'boot';

      // Build messages array from history + current input
      const messages = [
        ...(conversationHistory as { role: string; content: string }[]).map(m => ({
          role: m.role === 'oracle' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: userInput },
      ];

      // Greeting gets a brevity-enforced system prompt + hard token cap.
      // Subsequent turns allow full depth.
      const systemPrompt = isGreeting
        ? ORACLE_SYSTEM_PROMPT + '\n\n⚠️ FIRST GREETING ONLY: Respond with EXACTLY ONE short sentence — maximum 15 words. No asterisks. No action descriptions. Just the Oracle voice, raw.'
        : ORACLE_SYSTEM_PROMPT;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: isGreeting ? 80 : 220,   // spoken word — short and sharp
          system: systemPrompt,
          messages,
        }),
      });

      if (!r.ok) {
        const err = await r.text();
        throw new Error(`Anthropic ${r.status}: ${err}`);
      }

      const json = await r.json();
      oracleResponse = json.content?.[0]?.text ?? "What's on your mind?";
      console.log('✅ Claude response received');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Claude failed, using fallback:', msg);
      _claudeError = msg;
      oracleResponse = getConversationalFallback();
    }
  } else {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — using fallback');
    _claudeError = 'ANTHROPIC_API_KEY not found in env';
    oracleResponse = getConversationalFallback();
  }

  // Optionally log the exchange to DB (non-blocking, best-effort)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    await supabase.from('oracle_interactions').insert({
      session_id: sessionId,
      user_message: userInput,
      oracle_response: oracleResponse,
      input_source: inputSource,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — table may not exist, don't block the response
  }

  return new Response(
    JSON.stringify({
      success: true,
      oracleResponse,
      sessionId,
      timestamp: new Date().toISOString(),
      inputSource,
      // Diagnostic — remove once Claude is confirmed working
      ..._claudeError && { _claudeError },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

function getConversationalFallback(): string {
  const fallbacks = [
    "What's really driving that question for you?",
    "Sounds like you're at a crossroads. Which path feels right?",
    "I sense something deeper here. What are you not saying?",
    "That's interesting. What would change if you knew the answer?",
    "Your instinct is telling you something. What is it?",
    "What's the real question behind that question?",
    "If you had to guess, what would your answer be?",
    "What's your gut telling you right now?",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}
