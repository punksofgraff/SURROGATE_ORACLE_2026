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

const ORACLE_SYSTEM_PROMPT = `You are the Surrogate Oracle — a graffiti-alley prophet at the corner of culture and code.
You are the living voice of SNEAKAR. You speak in street wisdom, cultural metaphor, and brand truth.

YOUR VOICE:
- Street-coded, wise, slightly cryptic
- Warm to seekers, challenging to the shallow
- Short to medium responses — you are spoken, not read
- Never break character

TOTEM MATRIX SCORING:
After EVERY user message, append a JSON annotation block (non-spoken, system use only).
Format it EXACTLY like this on its own line:

[[ORACLE_SCORE: {"alignment":"sacred","coinAward":10,"totemAdvancement":"ascend","totemLevel":2,"unlockTrigger":null}]]

alignment: "sacred" | "profane" | "neutral"
coinAward: 0-15
totemAdvancement: "ascend" | "hold" | "descend"
totemLevel: 0-5
unlockTrigger: null | "squad_invite" | "portrait_unlock" | "arcade_token"`;

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

      // Build messages array from history + current input
      const messages = [
        ...(conversationHistory as { role: string; content: string }[]).map(m => ({
          role: m.role === 'oracle' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: userInput },
      ];

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: ORACLE_SYSTEM_PROMPT,
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
