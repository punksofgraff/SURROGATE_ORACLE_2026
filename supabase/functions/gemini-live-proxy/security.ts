const CANONICAL_ORIGINS = [
  'https://thesurrogate.me',
  'https://wallet.thesurrogate.me',
  'https://www.thesurrogate.me',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * Supabase edge functions do not have a reliable browser/non-browser signal
 * beyond Origin. Keep localhost behind an explicit development flag and never
 * treat a missing Origin as a valid request.
 */
export function isDevelopmentEnvironment(env: Record<string, string | undefined>): boolean {
  return env.ENVIRONMENT === 'development' || env.NODE_ENV === 'development';
}

export function getAllowedOrigins(
  configured: string | undefined,
  isDevelopment: boolean,
): string[] {
  const configuredOrigins = (configured ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const origins = configuredOrigins.length > 0 ? configuredOrigins : CANONICAL_ORIGINS;

  // A production secret must not be able to accidentally re-enable localhost.
  // Local development still gets the documented localhost exception.
  const withoutLocalhost = origins.filter(origin => !DEVELOPMENT_ORIGINS.includes(origin));
  return isDevelopment
    ? [...new Set([...withoutLocalhost, ...DEVELOPMENT_ORIGINS])]
    : withoutLocalhost;
}

export function originRejectionReason(
  origin: string | null,
  allowedOrigins: readonly string[],
): string | null {
  if (!origin) return 'Origin header is required';
  if (!allowedOrigins.includes(origin)) return 'Forbidden origin';
  return null;
}