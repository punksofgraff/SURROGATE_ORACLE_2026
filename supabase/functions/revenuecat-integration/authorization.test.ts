import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isAllowedUser } from './authorization.ts';

Deno.test('allows a subscription read for the caller IP', () => {
  assert(isAllowedUser('203.0.113.10', '203.0.113.10', null));
});

Deno.test('allows a subscription read for the wallet associated with the caller IP', () => {
  assert(isAllowedUser('0xabc', '203.0.113.10', '0xabc'));
});

Deno.test('rejects a caller-controlled user id belonging to another seeker', () => {
  assertFalse(isAllowedUser('victim-user', '203.0.113.10', '0xattacker'));
});

Deno.test('rejects an empty user id even when an identity is present', () => {
  assertFalse(isAllowedUser('', '203.0.113.10', null));
});