import {
  getAllowedOrigins,
  isDevelopmentEnvironment,
  originRejectionReason,
} from './security.ts';

Deno.test('rejects originless WebSocket requests', () => {
  const origins = getAllowedOrigins(undefined, false);
  if (originRejectionReason(null, origins) !== 'Origin header is required') {
    throw new Error('originless requests must be rejected');
  }
});

Deno.test('rejects direct WebSocket origins', () => {
  const origins = getAllowedOrigins(undefined, false);
  if (originRejectionReason('https://attacker.example', origins) !== 'Forbidden origin') {
    throw new Error('untrusted origins must be rejected');
  }
});

Deno.test('keeps localhost development-only', () => {
  const productionOrigins = getAllowedOrigins(undefined, false);
  const developmentOrigins = getAllowedOrigins(undefined, true);
  if (productionOrigins.includes('http://localhost:5173')) {
    throw new Error('localhost must not be allowed in production');
  }
  if (!developmentOrigins.includes('http://localhost:5173')) {
    throw new Error('localhost should be allowed in development');
  }
  if (isDevelopmentEnvironment({ ENVIRONMENT: 'production', NODE_ENV: 'production' })) {
    throw new Error('production must not be treated as development');
  }
});