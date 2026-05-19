/**
 * gemini-live-proxy — Supabase Edge Function
 *
 * Bidirectional WebSocket proxy between the browser and Gemini Live API.
 * Keeps GOOGLE_AI_API_KEY server-side — never exposed to the client.
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
  const upgrade = req.headers.get('upgrade') ?? '';

  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  if (!GOOGLE_AI_API_KEY) {
    return new Response('GOOGLE_AI_API_KEY not configured on Edge Function', { status: 500 });
  }

  // CORS preflight (browsers may send this before WS upgrade)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  // Connect to Gemini Live API
  const gemini = new WebSocket(GEMINI_LIVE_URL);

  // ── client → Gemini ──────────────────────────────────────────────────────
  client.onopen = () => {
    console.log('Client connected to proxy');
  };

  client.onmessage = (event) => {
    if (gemini.readyState === WebSocket.OPEN) {
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

  // ── Gemini → client ──────────────────────────────────────────────────────
  gemini.onopen = () => {
    console.log('Connected to Gemini Live API');
    // Notify the browser that Gemini is ready
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'session.created' }));
    }
  };

  gemini.onmessage = (event) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(event.data);
    }
  };

  gemini.onclose = (event) => {
    console.log('Gemini disconnected:', event.code, event.reason);
    if (client.readyState === WebSocket.OPEN) {
      client.close(event.code || 1000, event.reason || 'Gemini disconnected');
    }
  };

  gemini.onerror = (err) => {
    console.error('Gemini socket error:', err);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', message: 'Gemini Live connection failed' }));
    }
  };

  return response;
});
