import assert from 'node:assert/strict';
import { normalizeRuntimeError } from './oracle-runtime-evidence.mjs';

const pageError = normalizeRuntimeError({
  message: 'page exploded',
  filename: 'https://oracle.test/assets/app.js',
  lineno: 17,
  colno: 9,
  error: new Error('page exploded'),
}, 'pageerror');
assert.deepEqual(pageError, {
  type: 'pageerror',
  message: 'page exploded',
  source: 'https://oracle.test/assets/app.js',
  line: 17,
  column: 9,
  stack: pageError.stack,
  name: 'Error',
});

const rejectedString = normalizeRuntimeError({ reason: 'rejected string' }, 'unhandledrejection');
assert.deepEqual(rejectedString, {
  type: 'unhandledrejection',
  message: 'rejected string',
  reason: 'rejected string',
});

const rejectedError = new Error('rejected Error');
rejectedError.stack = 'Error: rejected Error\n    at fixture.js:23:4';
const rejection = normalizeRuntimeError({
  reason: rejectedError,
  filename: 'https://oracle.test/fixture.js',
  lineno: 23,
  colno: 4,
}, 'unhandledrejection');
assert.deepEqual(rejection, {
  type: 'unhandledrejection',
  message: 'rejected Error',
  source: 'https://oracle.test/fixture.js',
  line: 23,
  column: 4,
  stack: rejectedError.stack,
  reason: 'rejected Error',
  name: 'Error',
});

assert.doesNotThrow(() => JSON.parse(JSON.stringify([
  pageError,
  rejectedString,
  rejection,
  normalizeRuntimeError({ reason: { unexpected: true } }, 'unhandledrejection'),
])));

console.log('runtime evidence fixture passed');