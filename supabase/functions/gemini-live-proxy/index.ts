/**
 * gemini-live-proxy — Supabase Edge Function
 *
 * Bidirectional WebSocket proxy between the browser and Gemini Live API.
 * Keeps GOOGLE_AI_API_KEY server-side — never exposed to the client.
 *
 * Message translation:
 *   client → Gemini:  { type:"session.config", model, … }  →  { setup: { model, … } }
 *                     { type:"client.realtimeInput", realtimeInput:{…} }  →  { realtimeInput:{…} }
 *   Gemini → client:  { setupComplete:{} }      → swallowed (session.created sent on open)
 *                     { serverContent:{…} }     → { type:"server.content", serverContent:{…} }
 *                     { error:{…} }             → { type:"error", message:"…" }
 *
 * Deploy:
 *   npx supabase functions deploy gemini-live-proxy \
 *     --project-ref $SUPABASE_PROJECT_REF --use-api
 *
 * Set secret:
 *   npx supabase secrets set GOOGLE_AI_API_KEY=AIza... \
 *     --project-ref $SUPABASE_PROJECT_REF
 */

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') ?? '';

// Gemini Live BidiGenerateContent WebSocket endpoint
const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GOOGLE_AI_API_KEY}`;

Deno.serve(async (req: Request) => {
  // CORS preflight (browsers send this before WS upgrade)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const upgrade = req.headers.get('upgrade') ?? '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  if (!GOOGLE_AI_API_KEY) {
    console.error('❌ GOOGLE_AI_API_KEY not set — Oracle cannot connect to Gemini Live');
    return new Response(
      JSON.stringify({ type: 'error', message: 'GOOGLE_AI_API_KEY not configured. Set it via: npx supabase secrets set GOOGLE_AI_API_KEY=AIza...' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  // Connect to Gemini Live API
  const gemini = new WebSocket(GEMINI_LIVE_URL);

  // ── client → Gemini (with message translation) ────────────────────────────
  client.onopen = () => {
    console.log('✅ Client connected to proxy');
  };

  client.onmessage = (event) => {
    if (gemini.readyState !== WebSocket.OPEN) return;

    try {
      const msg = JSON.parse(event.data as string);

      if (msg.type === 'session.config') {
        // Translate to Gemini's native BidiGenerateContentSetup format
        const setup: Record<string, unknown> = {
          model: msg.model,
        };
        if (msg.systemInstruction) setup.systemInstruction = msg.systemInstruction;
        if (msg.generationConfig)  setup.generationConfig  = msg.generationConfig;
        console.log('📤 Sending setup to Gemini, model:', msg.model);
        gemini.send(JSON.stringify({ setup }));

      } else if (msg.type === 'client.realtimeInput') {
        // Strip the envelope — Gemini wants { realtimeInput: { … } } directly
        gemini.send(JSON.stringify({ realtimeInput: msg.realtimeInput }));

      } else {
        // Unknown type — pass through as-is for forward compatibility
        gemini.send(event.data as string);
      }
    } catch {
      // Not JSON — pass through raw (binary audio frames etc.)
      gemini.send(event.data);
    }
  };

  client.onclose = (event) => {
    console.log('Client disconnected:', event.code, event.reason);
    if (gemini.readyState === WebSocket.OPEN || gemini.readyState === WebSocket.CONNECTING) {
      gemini.close(1000, 'Client disconnected');
    }
  };

  client.onerror = (err) => {
    console.error('Client socket error:', err);
  };

  // ── Gemini → client (with message translation) ────────────────────────────
  gemini.onopen = () => {
    console.log('✅ Connected to Gemini Live API');
    // Tell the browser the session is ready. The client will send session.config next.
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'session.created' }));
    }
  };

  gemini.onmessage = (event) => {
    if (client.readyState !== WebSocket.OPEN) return;

    try {
      const msg = JSON.parse(event.data as string);

      if (msg.setupComplete !== undefined) {
        // Swallow — we already sent session.created on gemini.onopen
        console.log('✅ Gemini setup complete');
        return;
      }

      if (msg.serverContent !== undefined) {
        // Add the type field the client expects
        client.send(JSON.stringify({ type: 'server.content', ...msg }));
        return;
      }

      if (msg.error !== undefined) {
        const errorMsg = msg.error?.message || msg.error?.details || 'Gemini Live error';
        console.error('❌ Gemini error:', errorMsg);
        client.send(JSON.stringify({ type: 'error', message: errorMsg }));
        return;
      }

      // Unknown message — pass through as-is
      client.send(event.data as string);

    } catch {
      // Not JSON — pass through raw
      client.send(event.data);
    }
  };

  gemini.onclose = (event) => {
    console.log('Gemini disconnected:', event.code, event.reason);
    if (client.readyState === WebSocket.OPEN) {
      // Propagate the close so the client knows to show a reconnect prompt
      client.close(event.code || 1000, event.reason || 'Gemini disconnected');
    }
  };

  gemini.onerror = (err) => {
    console.error('❌ Gemini socket error:', err);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', message: 'Gemini Live connection failed. Check GOOGLE_AI_API_KEY and model name.' }));
    }
  };

  return response;
});
