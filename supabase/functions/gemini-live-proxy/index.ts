/**
 * gemini-live-proxy — Supabase Edge Function
 * v2 — 2026-05-22 force-redeploy to fix setupComplete→session.created translation
 *
 * Bidirectional WebSocket proxy between the browser and Gemini Live API.
 * Keeps GOOGLE_AI_API_KEY server-side — never exposed to the client.
 *
 * Message translation:
 *   client → Gemini:  { type:"session.config", model, … }  →  { setup: { model, … } }
 *                     { type:"client.realtimeInput", realtimeInput:{…} }  →  { realtimeInput:{…} }
 *   Gemini → client:  { setupComplete:{} }      → triggers { type:"session.created" } to client
 *                     { serverContent:{…} }     → { type:"server.content", serverContent:{…} }
 *                     { error:{…} }             → { type:"error", message:"…" }
 *
 * ⚠️  RACE-CONDITION FIX (May 2026):
 *   The browser sends session.config in ws.onopen, which can arrive at the proxy before
 *   Gemini's WebSocket is OPEN. Previously the proxy dropped it (readyState guard), so
 *   Gemini never got a setup message and returned 1007 on the first text turn.
 *   Fix: buffer client messages until Gemini is ready, flush on gemini.onopen.
 *   Additionally, session.created is now sent only after Gemini confirms setupComplete,
 *   not prematurely on gemini.onopen, so the browser never sends boot text before setup.
 *
 * Deploy:
 *   npx supabase functions deploy gemini-live-proxy \
 *     --project-ref $SUPABASE_PROJECT_REF --use-api --no-verify-jwt
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

  // Buffer for messages that arrive before Gemini's WS is OPEN.
  // Without this, a session.config sent in browser ws.onopen gets silently dropped
  // (readyState guard fires), Gemini never gets setup, first text turn → 1007.
  const pendingClientMessages: string[] = [];
  let geminiReady = false;

  // Helper: translate one client message and send it to Gemini
  const forwardToGemini = (rawData: string) => {
    try {
      const msg = JSON.parse(rawData);

      if (msg.type === 'session.config') {
        // Translate to Gemini's native BidiGenerateContentSetup format
        const setup: Record<string, unknown> = {
          model: msg.model,
        };
        if (msg.systemInstruction) setup.systemInstruction = msg.systemInstruction;
        if (msg.generationConfig)  setup.generationConfig  = msg.generationConfig;
        // Disable all tool use. tools:[] alone doesn't suppress built-in Gemini tools
        // (grounding, code execution). toolConfig.functionCallingConfig.mode=NONE is the
        // canonical BidiGenerateContent suppressor — forward both from the client config.
        if (msg.tools !== undefined) setup.tools = msg.tools;
        if (msg.toolConfig !== undefined) setup.toolConfig = msg.toolConfig;
        // Step 3 — native context-window compression. The server-side sliding window truncates
        // the oldest turns instead of hard-closing the session (~turn 10). System instruction and
        // prefix are guaranteed to survive the window, so the Oracle never forgets the persona.
        setup.contextWindowCompression = { slidingWindow: {} };
        // Step 4 (forward-compat) — relay session-resumption config when the client sends it.
        if (msg.sessionResumption !== undefined) setup.sessionResumption = msg.sessionResumption;
        console.log('📤 Sending setup to Gemini, model:', msg.model);
        gemini.send(JSON.stringify({ setup }));

      } else if (msg.type === 'client.realtimeInput') {
        // Strip the envelope — Gemini wants { realtimeInput: { … } } directly
        gemini.send(JSON.stringify({ realtimeInput: msg.realtimeInput }));

      } else {
        // Unknown type — pass through as-is for forward compatibility
        gemini.send(rawData);
      }
    } catch {
      // Not JSON — pass through raw (binary audio frames etc.)
      gemini.send(rawData);
    }
  };

  // Connect to Gemini Live API
  const gemini = new WebSocket(GEMINI_LIVE_URL);

  // ── client → Gemini (with message translation) ────────────────────────────
  client.onopen = () => {
    console.log('✅ Client connected to proxy');
  };

  client.onmessage = (event) => {
    if (!geminiReady) {
      // Gemini not open yet — buffer the message so it isn't lost
      pendingClientMessages.push(event.data as string);
      return;
    }
    forwardToGemini(event.data as string);
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
    console.log('✅ Connected to Gemini Live API — flushing', pendingClientMessages.length, 'buffered messages');
    geminiReady = true;
    // Flush any messages that arrived before Gemini was ready (e.g. session.config from browser ws.onopen)
    for (const raw of pendingClientMessages) {
      forwardToGemini(raw);
    }
    pendingClientMessages.length = 0;
    // NOTE: do NOT send session.created here — wait for Gemini's setupComplete confirmation below.
  };

  // Gemini may send JSON as text frames (string) OR binary frames (Blob/ArrayBuffer).
  // Make the handler async so we can await Blob.text() when needed.
  gemini.onmessage = async (event) => {
    if (client.readyState !== WebSocket.OPEN) return;

    // Normalise to a string so JSON.parse always has text to work with.
    let rawText: string;
    if (typeof event.data === 'string') {
      rawText = event.data;
    } else if (event.data instanceof Blob) {
      rawText = await event.data.text();
    } else if (event.data instanceof ArrayBuffer) {
      rawText = new TextDecoder().decode(event.data);
    } else {
      // Unknown type — pass through raw and bail
      client.send(event.data);
      return;
    }

    try {
      const msg = JSON.parse(rawText);

      if (msg.setupComplete !== undefined) {
        // Setup is confirmed — NOW tell the browser the session is ready.
        // Sending session.created here (instead of on gemini.onopen) prevents the browser
        // from sending boot text before Gemini has finished processing the setup message.
        console.log('✅ Gemini setup complete — sending session.created to client');
        client.send(JSON.stringify({ type: 'session.created' }));
        return;
      }

      if (msg.serverContent !== undefined) {
        // Add the type field the client expects
        client.send(JSON.stringify({ type: 'server.content', ...msg }));
        return;
      }

      if (msg.toolCall !== undefined) {
        // Gemini requested a tool call — Oracle has no tools, respond immediately
        // with an error so the session doesn't hang waiting for a toolResponse.
        const calls = msg.toolCall?.functionCalls ?? [];
        console.warn('⚠️  Gemini toolCall intercepted — rejecting', calls.map((c: { name?: string }) => c.name));
        const functionResponses = calls.map((call: { id?: string; name?: string }) => ({
          id: call.id ?? 'unknown',
          name: call.name ?? 'unknown',
          response: { error: 'Tool execution is not available in this Oracle context.' },
        }));
        gemini.send(JSON.stringify({ toolResponse: { functionResponses } }));
        // Notify client so UI can show a brief "processing" state if needed
        client.send(JSON.stringify({ type: 'tool.call.rejected', toolNames: calls.map((c: { name?: string }) => c.name) }));
        return;
      }

      if (msg.error !== undefined) {
        const errorMsg = msg.error?.message || msg.error?.details || 'Gemini Live error';
        console.error('❌ Gemini error:', errorMsg);
        client.send(JSON.stringify({ type: 'error', message: errorMsg }));
        return;
      }

      // Step 2/4 — native session-management signals that were previously dropped.
      // (usageMetadata may also ride along on a serverContent frame above, which the
      //  serverContent branch forwards via the {...msg} spread — handled client-side.)
      if (msg.goAway !== undefined) {
        // timeLeft is a protobuf Duration string, e.g. "9.5s".
        client.send(JSON.stringify({ type: 'goaway', timeLeft: msg.goAway?.timeLeft }));
        return;
      }
      if (msg.sessionResumptionUpdate !== undefined) {
        const u = msg.sessionResumptionUpdate;
        client.send(JSON.stringify({ type: 'resume', handle: u?.newHandle, resumable: u?.resumable }));
        return;
      }
      if (msg.usageMetadata !== undefined) {
        client.send(JSON.stringify({ type: 'usage', usage: msg.usageMetadata }));
        return;
      }

      // Unknown JSON message — pass through as normalised text
      client.send(rawText);

    } catch {
      // Not JSON (e.g. raw binary audio frames) — pass through raw bytes
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
