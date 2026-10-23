/**
 * parentTelemetry — opt-in engagement relay for a SNEAKAR parent page (sneakar.io/sneakarcade).
 *
 * OFF unless ALL of these hold:
 *   1. the page runs inside an iframe;
 *   2. the embed URL carries `?embed=sneakarcade` (the parent opts in explicitly);
 *   3. the parent's origin (resolved from the browser, never from a message) is on the allowlist below.
 *
 * When on, it forwards each `oracle:telemetry` event (trackOracleEvent) to that one parent origin as
 *   { type: 'surrogate:telemetry', v: 1, event: 'oracle_*', props: { ...numbers, booleans, short enum strings } }
 * plus lifecycle / conversion signals:
 *   { type: 'surrogate:ready', v: 1 }
 *   { type: 'surrogate:conversion', v: 1, kind: 'sign_in' | 'sign_up' | 'wallet_connect' }
 *   { type: 'surrogate:session-end', v: 1, turns, total_ms }
 *
 * Privacy: no session ids, no wallet addresses, no emails, no free text (phrases, prompts, error strings) ever leave the
 * frame. The parent re-validates every field against its own allowlist before anything is stored.
 */
import { normalizeTrustedOrigin, postToTrustedParent, resolveTrustedParentOrigin } from './xrBridge';
import { isInIframe } from './browserCapabilities';

const EXACT_ORIGINS = new Set([
  'https://sneakar.io',
  'https://www.sneakar.io',
  'https://kreait.sneakar.io',
]);
/** SNEAKARXR Vercel previews + local dev of the parent. */
const ORIGIN_PATTERNS = [
  /^https:\/\/sneakarxr-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export function isAllowedParentOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const extra = normalizeTrustedOrigin((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SNEAKAR_PARENT_ORIGIN);
  if (extra && origin === extra) return true;
  return EXACT_ORIGINS.has(origin) || ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/** Short enum-like string props that are safe to forward (everything else that is a string is dropped). */
const STRING_KEYS = new Set([
  'phase', 'territory', 'color', 'test_name', 'variant', 'phase_at_exit', 'type', 'sensor', 'state',
]);
const DROP_KEYS = new Set(['event', 'session_id', 'error', 'reason', 'phrase_id', 'prompt_id']);

export function sanitizeTelemetry(detail: Record<string, unknown>): { event: string; props: Record<string, string | number | boolean> } | null {
  const event = typeof detail?.event === 'string' ? detail.event : '';
  if (!/^oracle_[a-z_]{1,48}$/.test(event)) return null;
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (DROP_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) props[k] = v;
    else if (typeof v === 'boolean') props[k] = v;
    else if (typeof v === 'string' && STRING_KEYS.has(k) && /^[A-Za-z0-9 _#:.-]{1,32}$/.test(v)) props[k] = v;
  }
  return { event, props };
}

let installed = false;

/** Install once from main.tsx. Returns true when the relay is live. */
export function installParentTelemetry(): boolean {
  if (installed || typeof window === 'undefined') return installed;
  if (!isInIframe()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('embed') !== 'sneakarcade') return false;

  const ancestorOrigins = (window.location as Location & { ancestorOrigins?: { [i: number]: string; length: number } }).ancestorOrigins;
  const origin = resolveTrustedParentOrigin({
    ancestorOrigin: ancestorOrigins?.[0],
    referrer: document.referrer,
  });
  if (!isAllowedParentOrigin(origin)) {
    console.info('[parentTelemetry] parent origin not allowed; relay stays off');
    return false;
  }
  const parent = window.parent;
  installed = true;

  const send = (msg: Record<string, unknown>) => {
    try { postToTrustedParent(parent, origin, { v: 1, ...msg }); } catch { /* parent gone */ }
  };

  window.addEventListener('oracle:telemetry', (e: Event) => {
    const clean = sanitizeTelemetry((e as CustomEvent).detail ?? {});
    if (!clean) return;
    send({ type: 'surrogate:telemetry', event: clean.event, props: clean.props });
    if (clean.event === 'oracle_exit') {
      send({ type: 'surrogate:session-end', turns: clean.props.turns ?? 0, total_ms: clean.props.total_ms ?? 0 });
    }
  });

  // Conversions: dispatched as `oracle:conversion` CustomEvents by the flows that own them (wallet bridge, auth).
  window.addEventListener('oracle:conversion', (e: Event) => {
    const kind = (e as CustomEvent).detail?.kind;
    if (kind === 'sign_in' || kind === 'sign_up' || kind === 'wallet_connect') send({ type: 'surrogate:conversion', kind });
  });

  send({ type: 'surrogate:ready' });
  return true;
}

/** Flows call this at the moment a conversion lands (no identifiers: only the kind). */
export function emitConversion(kind: 'sign_in' | 'sign_up' | 'wallet_connect'): void {
  try { window.dispatchEvent(new CustomEvent('oracle:conversion', { detail: { kind } })); } catch { /* SSR / old browser */ }
}
