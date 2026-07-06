/**
 * devAccess.ts — shared dev/debug unlock gate.
 *
 * Single source of truth for the password-gated dev bypass (GoogleSignInOverlay)
 * and the SALVAGE diagnostics gate (BackendControlPanel). Both used to compare
 * against a hardcoded literal duplicated in two files — now both read from
 * VITE_DEV_UNLOCK_PASSWORD (a build-time env var / Replit secret) instead.
 *
 * Fails CLOSED: if the env var is not configured, unlock is never possible.
 */

const DEV_UNLOCK_PASSWORD = import.meta.env.VITE_DEV_UNLOCK_PASSWORD;

/** True when a candidate string matches the configured dev-unlock password. */
export function checkDevUnlock(candidate: string): boolean {
  if (!DEV_UNLOCK_PASSWORD) return false;
  return candidate === DEV_UNLOCK_PASSWORD;
}
