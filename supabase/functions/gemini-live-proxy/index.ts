/**
 * gemini-live-proxy — Supabase Edge Function
 * v6 — Train Station Key Rotation
 *
 * CRITICAL ORDER: upgrade header check must come BEFORE the GET-method check,
 * because WebSocket handshakes arrive as GET requests. Swapping that order was
 * the cause of the 502: the status handler intercepted the WS upgrade, ran an
 * async fetch, and returned JSON instead of the 101 Upgrade response.
 *
 * Key rotation strategy:
 *   - GOOGLE_AI_KEY_FREE  → default (free-tier daily quota)
 *   - 3 abnormal closes before setupComplete → switch to GOOGLE_AI_KEY_PAID
 *   - After 24 h on PAID → auto-reset to FREE
 *   - State persisted in oracle_key_state (single row, id=1)
 *
 * Deploy:
 *   npx supabase functions deploy gemini-live-proxy \
 *     --project-ref $SUPABASE_PROJECT_REF --use-api --no-verify-jwt
 */

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_AI_KEY_FREE        = Deno.env.get('GOOGLE_AI_KEY_FREE') ?? '';
const GOOGLE_AI_KEY_PAID        = Deno.env.get('GOOGLE_AI_KEY_PAID') ?? '';

const FAIL_THRESHOLD = 3;
const PAID_RESET_MS  = 24 * 60 * 60 * 1000;
const GEMINI_BASE    = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// ALLOW_PAID_FAILOVER — safety gate for the paid-key failover logic.
// Default: false — fail visibly to the client rather than silently escalate to paid billing.
// Set to 'true' in Supabase secrets ONLY after confirming budget controls are in place
// and you want seamless continuity when the free daily quota is exhausted.
const ALLOW_PAID_FAILOVER = (Deno.env.get('ALLOW_PAID_FAILOVER') ?? 'false').toLowerCase() === 'true';

// ALLOWED_ORIGINS — comma-separated list of permitted request origins.
// Empty (default): origin check disabled — fails OPEN so prod is never broken by a missing secret.
// Non-empty: only listed origins are allowed; all others receive 403.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

// MAX_SESSION_MS — hard cap on a single Gemini session duration.
// Default: 900000 ms (15 minutes). Set to 0 to disable (not recommended in production).
const MAX_SESSION_MS = Number(Deno.env.get('MAX_SESSION_MS') ?? '900000');

// One-time warning flag for missing ALLOWED_ORIGINS (avoids log spam).
let originCheckWarned = false;

// ── Module-level state cache ───────────────────────────────────────────────
// Seeded optimistically so the first WS connection never blocks on a DB fetch.
// Refreshed async after every connection result.

interface KeyState {
  mode: 'free' | 'paid';
  free_fail_count: number;
  switched_to_paid_at: string | null;
}

let cachedState: KeyState = { mode: 'free', free_fail_count: 0, switched_to_paid_at: null };
let cacheBooted = false;

async function fetchState(): Promise<KeyState> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/oracle_key_state?id=eq.1&select=*`,
      { headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': SUPABASE_SERVICE_ROLE_KEY } },
    );
    const rows = await res.json() as KeyState[];
    return rows[0] ?? { mode: 'free', free_fail_count: 0, switched_to_paid_at: null };
  } catch {
    return cachedState;
  }
}

async function patchState(patch: Partial<KeyState>): Promise<void> {
  try {
    const next = { ...cachedState, ...patch };
    await fetch(`${SUPABASE_URL}/rest/v1/oracle_key_state?id=eq.1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ ...next, updated_at: new Date().toISOString() }),
    });
    cachedState = next;
  } catch (e) {
    console.error('patchState failed:', e);
  }
}

// Resolved synchronously from cache — never blocks the WS handler
function resolveKeySync(): { key: string; mode: 'free' | 'paid' } {
  const s = cachedState;
  if (s.mode === 'paid' && s.switched_to_paid_at) {
    const elapsed = Date.now() - new Date(s.switched_to_paid_at).getTime();
    if (elapsed >= PAID_RESET_MS) {
      console.log('⏰ 24 h elapsed — resetting to free');
      cachedState = { mode: 'free', free_fail_count: 0, switched_to_paid_at: null };
      patchState(cachedState);
      return { key: GOOGLE_AI_KEY_FREE, mode: 'free' };
    }
  }
  return { key: s.mode === 'paid' ? GOOGLE_AI_KEY_PAID : GOOGLE_AI_KEY_FREE, mode: s.mode };
}

// Fire-and-forget cache seed on first request
function ensureCacheBooted() {
  if (cacheBooted) return;
  cacheBooted = true;
  fetchState().then(s => { cachedState = s; }).catch(() => {});
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    const preflightOrigin = req.headers.get('origin') ?? '';
    const allowOriginHeader =
      ALLOWED_ORIGINS.length === 0
        ? '*'
        : ALLOWED_ORIGINS.includes(preflightOrigin)
          ? preflightOrigin
          : null;
    if (allowOriginHeader === null) {
      return new Response('Forbidden origin', { status: 403 });
    }
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': allowOriginHeader,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // 2. WebSocket upgrade — MUST be checked before the GET branch because
  //    WS handshakes are GET requests. Checking GET first causes a 502.
  const upgradeHeader = req.headers.get('upgrade') ?? '';
  if (upgradeHeader.toLowerCase() === 'websocket') {
    // Origin check — must happen BEFORE upgradeWebSocket (the call is irreversible).
    const origin = req.headers.get('origin') ?? '';
    if (ALLOWED_ORIGINS.length > 0) {
      if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return new Response('Forbidden origin', { status: 403 });
      }
    } else {
      if (!originCheckWarned) {
        originCheckWarned = true;
        console.warn('[gemini-live-proxy] ALLOWED_ORIGINS unset — origin check disabled');
      }
    }

    ensureCacheBooted();

    const { key: activeKey, mode: activeMode } = resolveKeySync();
    const snapshotFailCount = cachedState.free_fail_count;
    console.log(`🚉 Key mode: ${activeMode} | free_fails: ${snapshotFailCount}/${FAIL_THRESHOLD}`);

    const { socket: client, response } = Deno.upgradeWebSocket(req);
    const gemini = new WebSocket(`${GEMINI_BASE}?key=${activeKey}`);

    // Kill timer — cleared in both onclose handlers to avoid leaks.
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const pendingClientMessages: string[] = [];
    let geminiReady = false;
    let sessionSucceeded = false;

    const forwardToGemini = (rawData: string) => {
      try {
        const msg = JSON.parse(rawData);
        if (msg.type === 'session.config') {
          const setup: Record<string, unknown> = { model: msg.model };
          if (msg.systemInstruction)               setup.systemInstruction    = msg.systemInstruction;
          if (msg.generationConfig)                setup.generationConfig     = msg.generationConfig;
          if (msg.tools !== undefined)             setup.tools                = msg.tools;
          if (msg.toolConfig !== undefined)        setup.toolConfig           = msg.toolConfig;
          if (msg.sessionResumption !== undefined) setup.sessionResumption    = msg.sessionResumption;
          if (msg.realtimeInputConfig !== undefined) setup.realtimeInputConfig = msg.realtimeInputConfig;
          // Transcription configs — native-audio models deliver spoken text (incl.
          // hidden score blocks) only via outputTranscription; input transcription
          // is the only text record of what the Seeker said aloud.
          if (msg.inputAudioTranscription !== undefined)  setup.inputAudioTranscription  = msg.inputAudioTranscription;
          if (msg.outputAudioTranscription !== undefined) setup.outputAudioTranscription = msg.outputAudioTranscription;
          setup.contextWindowCompression = { slidingWindow: {} };
          console.log('📤 setup → Gemini, model:', msg.model, '| key:', activeMode);
          gemini.send(JSON.stringify({ setup }));
        } else if (msg.type === 'client.realtimeInput') {
          gemini.send(JSON.stringify({ realtimeInput: msg.realtimeInput }));
        } else {
          gemini.send(rawData);
        }
      } catch {
        gemini.send(rawData);
      }
    };

    client.onopen  = () => console.log('✅ Client connected');
    client.onerror = (err) => console.error('Client error:', err);
    client.onclose = (event) => {
      console.log('Client disconnected:', event.code, event.reason);
      clearTimeout(killTimer);
      if (gemini.readyState === WebSocket.OPEN || gemini.readyState === WebSocket.CONNECTING) {
        gemini.close(1000, 'Client disconnected');
      }
    };
    client.onmessage = (event) => {
      if (!geminiReady) { pendingClientMessages.push(event.data as string); return; }
      forwardToGemini(event.data as string);
    };

    gemini.onopen = () => {
      console.log('✅ Gemini Live open — flushing', pendingClientMessages.length, 'buffered msgs');
      geminiReady = true;
      for (const raw of pendingClientMessages) forwardToGemini(raw);
      pendingClientMessages.length = 0;
      // Start the session time cap. Both sockets are closed if the timer fires.
      if (MAX_SESSION_MS > 0) {
        killTimer = setTimeout(() => {
          console.warn(`[gemini-live-proxy] Max session duration (${MAX_SESSION_MS}ms) reached — closing both sockets`);
          try { client.close(1000, 'Max session duration reached'); } catch {}
          try { gemini.close(1000, 'Max session duration reached'); } catch {}
        }, MAX_SESSION_MS);
      }
    };

    gemini.onmessage = async (event) => {
      if (client.readyState !== WebSocket.OPEN) return;

      let rawText: string;
      if (typeof event.data === 'string') {
        rawText = event.data;
      } else if (event.data instanceof Blob) {
        rawText = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        rawText = new TextDecoder().decode(event.data);
      } else {
        client.send(event.data); return;
      }

      try {
        const msg = JSON.parse(rawText);

        if (msg.setupComplete !== undefined) {
          sessionSucceeded = true;
          if (activeMode === 'free' && snapshotFailCount > 0) patchState({ free_fail_count: 0 });
          console.log('✅ setupComplete → session.created');
          client.send(JSON.stringify({ type: 'session.created' }));
          client.send(JSON.stringify({ type: 'key.mode', mode: activeMode }));
          return;
        }
        if (msg.serverContent !== undefined) {
          client.send(JSON.stringify({ type: 'server.content', ...msg })); return;
        }
        if (msg.toolCall !== undefined) {
          const calls = msg.toolCall?.functionCalls ?? [];
          console.warn('⚠️  toolCall intercepted', calls.map((c: { name?: string }) => c.name));
          gemini.send(JSON.stringify({
            toolResponse: {
              functionResponses: calls.map((c: { id?: string; name?: string }) => ({
                id: c.id ?? 'unknown', name: c.name ?? 'unknown',
                response: { error: 'Tools not available in Oracle context.' },
              })),
            },
          }));
          client.send(JSON.stringify({ type: 'tool.call.rejected', toolNames: calls.map((c: { name?: string }) => c.name) }));
          return;
        }
        if (msg.error !== undefined) {
          const m = msg.error?.message || 'Gemini Live error';
          console.error('❌ Gemini error:', m);
          client.send(JSON.stringify({ type: 'error', message: m })); return;
        }
        if (msg.goAway !== undefined) {
          client.send(JSON.stringify({ type: 'goaway', timeLeft: msg.goAway?.timeLeft })); return;
        }
        if (msg.sessionResumptionUpdate !== undefined) {
          const u = msg.sessionResumptionUpdate;
          client.send(JSON.stringify({ type: 'resume', handle: u?.newHandle, resumable: u?.resumable })); return;
        }
        if (msg.usageMetadata !== undefined) {
          client.send(JSON.stringify({ type: 'usage', usage: msg.usageMetadata })); return;
        }
        client.send(rawText);
      } catch {
        client.send(event.data);
      }
    };

    gemini.onclose = (event) => {
      console.log('Gemini closed:', event.code, event.reason);
      clearTimeout(killTimer);
      if (event.code !== 1000 && event.code !== 1001 && !sessionSucceeded && activeMode === 'free') {
        const newCount = snapshotFailCount + 1;
        console.warn(`🚉 Free key failure ${newCount}/${FAIL_THRESHOLD}`);
        if (newCount >= FAIL_THRESHOLD) {
          if (ALLOW_PAID_FAILOVER) {
            // Paid failover enabled — escalate to the paid key for continuity.
            console.warn('🚉 → Switching to PAID key (ALLOW_PAID_FAILOVER=true)');
            patchState({ mode: 'paid', free_fail_count: 0, switched_to_paid_at: new Date().toISOString() });
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'key.switched', mode: 'paid', reason: 'free_exhausted' }));
            }
          } else {
            // Paid failover disabled — fail visibly rather than silently spend money.
            // To enable auto-escalation, set ALLOW_PAID_FAILOVER=true in Supabase secrets.
            console.warn('🚉 Free quota reached. ALLOW_PAID_FAILOVER=false — refusing paid escalation.');
            patchState({ free_fail_count: newCount });
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'error', message: 'Service temporarily unavailable (free quota reached).' }));
            }
          }
        } else {
          patchState({ free_fail_count: newCount });
        }
      }
      if (client.readyState === WebSocket.OPEN) {
        client.close(event.code || 1000, event.reason || 'Gemini disconnected');
      }
    };

    gemini.onerror = (err) => {
      console.error('❌ Gemini socket error:', err);
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'error', message: 'Gemini Live connection failed.' }));
      }
    };

    return response;
  }

  // 3. Status / health check (plain GET, no upgrade header)
  if (req.method === 'GET') {
    const state = await fetchState();
    cachedState = state;
    const hoursLeft = state.mode === 'paid' && state.switched_to_paid_at
      ? Math.max(0, 24 - (Date.now() - new Date(state.switched_to_paid_at).getTime()) / 3_600_000).toFixed(1)
      : null;
    return new Response(JSON.stringify({
      mode: state.mode,
      free_fail_count: state.free_fail_count,
      switched_to_paid_at: state.switched_to_paid_at,
      paid_resets_in_hours: hoursLeft,
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://thesurrogate.me' } });
  }

  return new Response('Expected WebSocket upgrade', { status: 426 });
});
