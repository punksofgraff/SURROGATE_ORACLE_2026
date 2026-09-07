import assert from 'node:assert/strict';
import {
  HOLODEXR_MESSAGE_TYPES,
  isTrustedHolodeXRMessage,
  normalizeTrustedOrigin,
  postToTrustedParent,
  resolveTrustedParentOrigin,
  stopMediaStreamTracks,
} from '../src/lib/xrBridge';

const parentWindow = {} as Window;
const attackerWindow = {} as Window;
const trustedOrigin = 'https://holodexr.example';

assert.equal(normalizeTrustedOrigin('https://holodexr.example/immersive'), trustedOrigin);
assert.equal(normalizeTrustedOrigin('null'), null);
assert.equal(normalizeTrustedOrigin('data:text/plain,spoof'), null);

assert.equal(
  resolveTrustedParentOrigin({
    configuredOrigin: trustedOrigin,
    ancestorOrigin: 'https://attacker.example',
    referrer: 'https://attacker.example/page',
  }),
  trustedOrigin,
);
assert.equal(
  resolveTrustedParentOrigin({
    ancestorOrigin: 'https://holodexr.example/frame',
    referrer: 'https://attacker.example/page',
  }),
  trustedOrigin,
);
assert.equal(
  resolveTrustedParentOrigin({ referrer: 'not a URL' }),
  null,
);

const trustedInit = {
  origin: trustedOrigin,
  source: parentWindow,
  data: { type: 'holodexr:init' },
} as MessageEvent;
assert.equal(isTrustedHolodeXRMessage(trustedInit, trustedOrigin, parentWindow), true);
assert.equal(
  isTrustedHolodeXRMessage(
    { ...trustedInit, origin: 'https://attacker.example' } as MessageEvent,
    trustedOrigin,
    parentWindow,
  ),
  false,
);
assert.equal(
  isTrustedHolodeXRMessage(
    { ...trustedInit, source: attackerWindow } as MessageEvent,
    trustedOrigin,
    parentWindow,
  ),
  false,
);
assert.equal(
  isTrustedHolodeXRMessage(
    { ...trustedInit, data: { type: 'holodexr:unknown' } } as MessageEvent,
    trustedOrigin,
    parentWindow,
  ),
  false,
);

for (const type of HOLODEXR_MESSAGE_TYPES) {
  assert.equal(
    isTrustedHolodeXRMessage(
      { origin: trustedOrigin, source: parentWindow, data: { type } } as MessageEvent,
      trustedOrigin,
      parentWindow,
    ),
    true,
    `${type} remains supported`,
  );
}

let postedMessage: unknown = null;
let postedOrigin: string | null = null;
const postTarget = {
  postMessage: (message: unknown, origin: string) => {
    postedMessage = message;
    postedOrigin = origin;
  },
} as Pick<Window, 'postMessage'>;
assert.equal(
  postToTrustedParent(postTarget, trustedOrigin, { type: 'oracle:ready' }),
  true,
);
assert.deepEqual(postedMessage, { type: 'oracle:ready' });
assert.equal(postedOrigin, trustedOrigin);
assert.equal(postToTrustedParent(postTarget, null, { type: 'oracle:ready' }), false);

let stopped = 0;
stopMediaStreamTracks({
  getTracks: () => [
    { stop: () => { stopped += 1; } },
    { stop: () => { stopped += 1; } },
  ],
} as MediaStream);
assert.equal(stopped, 2);

console.log('XR bridge contract: all assertions passed');