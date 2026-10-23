import assert from 'node:assert/strict';
import { isAllowedParentOrigin, sanitizeTelemetry } from '../src/lib/parentTelemetry';

// Only SNEAKAR parents (prod, previews, local dev) may receive the relay.
assert.equal(isAllowedParentOrigin('https://sneakar.io'), true);
assert.equal(isAllowedParentOrigin('https://www.sneakar.io'), true);
assert.equal(isAllowedParentOrigin('https://sneakarxr-abc123-punksofgraff.vercel.app'), true);
assert.equal(isAllowedParentOrigin('http://localhost:3000'), true);
assert.equal(isAllowedParentOrigin('https://evil.vercel.app'), false);
assert.equal(isAllowedParentOrigin('https://sneakar.io.evil.com'), false);
assert.equal(isAllowedParentOrigin(null), false);

// No session ids, free text or error strings leave the frame.
const s = sanitizeTelemetry({ event: 'oracle_knife_selected', territory: 'SELF', card_index: 2, color: '#00ff88', session_id: 'abc' });
assert.deepEqual(s, { event: 'oracle_knife_selected', props: { territory: 'SELF', card_index: 2, color: '#00ff88' } });
const g = sanitizeTelemetry({ event: 'oracle_ghost_text_shown', phrase_id: 'i am not supposed to be here', duration_ms: 0 });
assert.deepEqual(g, { event: 'oracle_ghost_text_shown', props: { duration_ms: 0 } });
const e = sanitizeTelemetry({ event: 'oracle_claim_error', session_id: 'x', error: 'wallet 0xabc failed for a@b.co' });
assert.deepEqual(e, { event: 'oracle_claim_error', props: {} });
assert.equal(sanitizeTelemetry({ event: 'not_oracle' }), null);
assert.equal(sanitizeTelemetry({ event: 'oracle_x', phase: 'a very long free text phrase that is not an enum value at all' })?.props.phase, undefined);

console.log('parent-telemetry contract: OK');
