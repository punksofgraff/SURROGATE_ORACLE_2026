/**
 * oracle-trace — server-mediated access to the oracle_session_traces table.
 *
 * The table has RLS enabled with NO client policies; this function (service
 * role) is the only path in or out. Every request — ingest and read alike —
 * must present the ORACLE_TRACE_DEV_TOKEN shared secret in the x-trace-token
 * header. The token never ships in the app bundle; a developer pastes it into
 * localStorage to enable tracing on their own browser.
 *
 * Actions (POST JSON):
 *   { action: "ingest",   rows: [{ session_id, seq, event_type, payload, client_ts }] }
 *   { action: "sessions", limit? }
 *   { action: "trace",    session_id, limit? }
 *
 * Deploy with --no-verify-jwt (verify_jwt: false).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-token',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEV_TOKEN = Deno.env.get('ORACLE_TRACE_DEV_TOKEN') ?? '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Constant-time string comparison to avoid token-guessing via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

const MAX_ROWS_PER_BATCH = 50;
const MAX_PAYLOAD_CHARS = 8000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  // Authorization: shared dev token, verified server-side. If the secret is
  // not configured, deny everything — tracing is opt-in infrastructure.
  const token = req.headers.get('x-trace-token') ?? '';
  if (!DEV_TOKEN || !token || !timingSafeEqual(token, DEV_TOKEN)) {
    return json(401, { error: 'unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  try {
    switch (body.action) {
      case 'ingest': {
        const rowsIn = Array.isArray(body.rows) ? body.rows : [];
        if (rowsIn.length === 0) return json(400, { error: 'rows required' });
        const rows = rowsIn.slice(0, MAX_ROWS_PER_BATCH).map((r: Record<string, unknown>) => {
          let payload = r.payload && typeof r.payload === 'object' ? r.payload : {};
          const asStr = JSON.stringify(payload);
          if (asStr.length > MAX_PAYLOAD_CHARS) {
            payload = { truncated: true, preview: asStr.slice(0, MAX_PAYLOAD_CHARS) };
          }
          return {
            session_id: String(r.session_id ?? '').slice(0, 64),
            seq: Number.isFinite(r.seq) ? Number(r.seq) : 0,
            event_type: String(r.event_type ?? 'unknown').slice(0, 64),
            payload,
            client_ts: Number.isFinite(r.client_ts) ? Number(r.client_ts) : null,
          };
        }).filter((r) => r.session_id.length > 0);
        if (rows.length === 0) return json(400, { error: 'no valid rows' });

        const res = await fetch(`${SUPABASE_URL}/rest/v1/oracle_session_traces`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify(rows),
        });
        if (!res.ok) return json(502, { error: await res.text() });
        return json(200, { ok: true, inserted: rows.length });
      }

      case 'sessions': {
        const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/oracle_recent_trace_sessions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_limit: limit }),
        });
        if (!res.ok) return json(502, { error: await res.text() });
        return json(200, await res.json());
      }

      case 'trace': {
        const sid = String(body.session_id ?? '');
        if (!sid) return json(400, { error: 'session_id required' });
        const limit = Math.min(Math.max(Number(body.limit) || 2000, 1), 5000);
        const url =
          `${SUPABASE_URL}/rest/v1/oracle_session_traces` +
          `?session_id=eq.${encodeURIComponent(sid)}` +
          `&select=seq,event_type,payload,client_ts,created_at` +
          `&order=client_ts.asc.nullslast,seq.asc&limit=${limit}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return json(502, { error: await res.text() });
        return json(200, await res.json());
      }

      default:
        return json(400, { error: 'unknown action' });
    }
  } catch (err) {
    return json(500, { error: String(err) });
  }
});
