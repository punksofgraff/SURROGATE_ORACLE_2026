/**
 * tracedFetch.ts — traced wrapper for edge-function fetch calls.
 *
 * When dev tracing is enabled, wraps a fetch call to:
 *   1. Inject `x-oracle-request-id` (uuid) and `x-oracle-session-id` into
 *      request headers so edge-function logs are joinable to client traces.
 *   2. Emit an `api` traceEvent with function name, method, status, duration,
 *      and error class on completion.
 *
 * Usage (drop-in replacement anywhere a Supabase edge function is called):
 *   import { tracedFetch } from '../lib/tracedFetch';
 *   const res = await tracedFetch('seeker-echo', url, init);
 *
 * Rules:
 *   - Never records request/response bodies, auth headers, or API keys.
 *   - When tracing is disabled the call goes straight to native fetch — zero overhead.
 *   - Absolutely silent on any tracing error; the underlying fetch result is
 *     always returned / error always re-thrown regardless of trace state.
 */

import { isTracingEnabled, traceEvent, getTraceSessionId } from './sessionTrace';

function currentSessionId(): string {
  return getTraceSessionId() ?? 'unknown';
}

/** Generate a short correlation id. Falls back to timestamp+random when
 *  crypto.randomUUID is unavailable (some headless/test environments). */
function newRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 18);
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Traced drop-in for fetch targeting a Supabase edge function.
 *
 * @param fnName   Short function name shown in the trace (e.g. 'seeker-echo').
 *                 Pass '' to auto-derive from the URL.
 * @param url      Full fetch URL.
 * @param init     Standard RequestInit.
 */
export async function tracedFetch(
  fnName: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isTracingEnabled()) {
    return fetch(url, init);
  }

  const requestId = newRequestId();
  const sessionId = currentSessionId();
  const name = fnName || url.split('/functions/v1/')[1]?.split('?')[0] || url;
  const method = (init.method ?? 'GET').toUpperCase();
  const t0 = Date.now();

  // Merge our correlation headers into the existing headers without mutating
  // the caller's original init object. Never forward/overwrite Authorization or apikey.
  const existingHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { existingHeaders[k] = v; });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([k, v]) => { existingHeaders[k] = v; });
    } else {
      Object.assign(existingHeaders, init.headers as Record<string, string>);
    }
  }

  const tracedInit: RequestInit = {
    ...init,
    headers: {
      ...existingHeaders,
      'x-oracle-request-id': requestId,
      'x-oracle-session-id': sessionId,
    },
  };

  let status = 0;
  let errorClass: string | undefined;
  try {
    const res = await fetch(url, tracedInit);
    status = res.status;
    traceEvent('api', {
      fn: name,
      method,
      status,
      ms: Date.now() - t0,
      request_id: requestId,
      ok: res.ok,
    });
    return res;
  } catch (err) {
    errorClass = err instanceof Error ? err.constructor.name : String(typeof err);
    traceEvent('api', {
      fn: name,
      method,
      status: 0,
      ms: Date.now() - t0,
      request_id: requestId,
      ok: false,
      error: errorClass,
    });
    throw err;
  }
}

/**
 * Traced wrapper for supabase.functions.invoke-style calls that use raw fetch.
 * Identical to tracedFetch but automatically derives fnName from the URL.
 */
export function tracedEdgeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return tracedFetch('', url, init);
}

/**
 * fetch-signature adapter for the Supabase client's `global.fetch` option.
 * Routes edge-function calls (/functions/v1/) through tracedFetch so every
 * `supabase.functions.invoke` is traced without touching any call site.
 * All other Supabase traffic (REST, storage) passes straight through.
 *
 * Request-object inputs are passed through untraced (supabase-js uses string
 * URLs for functions.invoke, so this path never applies in practice).
 */
export function supabaseTraceFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isTracingEnabled()) return fetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
  if (url && url.includes('/functions/v1/')) {
    return tracedFetch('', url, init ?? {});
  }
  return fetch(input, init);
}
