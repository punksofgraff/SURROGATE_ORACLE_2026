export const HOLODEXR_MESSAGE_TYPES = new Set([
  'holodexr:init',
  'holodexr:marker-detected',
  'holodexr:marker-lost',
]);

type OriginSource = string | null | undefined;

export function normalizeTrustedOrigin(value: OriginSource): string | null {
  if (!value || value === 'null') return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the parent origin without accepting an origin from the message
 * itself. A build-time origin is the strongest option; ancestorOrigins and
 * referrer provide the browser-visible parent identity for local/WebView
 * embeds when no explicit deployment value is configured.
 */
export function resolveTrustedParentOrigin({
  configuredOrigin,
  ancestorOrigin,
  referrer,
}: {
  configuredOrigin?: OriginSource;
  ancestorOrigin?: OriginSource;
  referrer?: OriginSource;
}): string | null {
  return (
    normalizeTrustedOrigin(configuredOrigin) ??
    normalizeTrustedOrigin(ancestorOrigin) ??
    normalizeTrustedOrigin(referrer)
  );
}

export function isTrustedHolodeXRMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  trustedOrigin: string | null,
  trustedSource: Window | null,
): boolean {
  if (!trustedOrigin || !trustedSource) return false;
  if (event.origin !== trustedOrigin || event.source !== trustedSource) return false;

  const type = (event.data as { type?: unknown } | null)?.type;
  return typeof type === 'string' && HOLODEXR_MESSAGE_TYPES.has(type);
}

export function postToTrustedParent(
  target: Pick<Window, 'postMessage'> | null,
  origin: string | null,
  message: unknown,
): boolean {
  if (!target || !origin) return false;
  target.postMessage(message, origin);
  return true;
}

export function stopMediaStreamTracks(
  stream: Pick<MediaStream, 'getTracks'> | null,
): void {
  stream?.getTracks().forEach((track) => track.stop());
}