import {
  assert,
  assertEquals,
  assertMatch,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Wallet } from 'npm:ethers@6';
import { createWalletSyncHandler } from './index.ts';

type Challenge = {
  nonce: string;
  ip_address: string;
  message: string;
  expires_at: string;
  used_at: string | null;
};

const IP = '203.0.113.42';
const NOW = Date.parse('2026-08-21T12:00:00.000Z');

function fakeSupabase(challenges: Challenge[] = []) {
  const writes: Array<Record<string, unknown>> = [];
  let nonce = 0;

  const client = {
    from(table: string) {
      if (table !== 'wallet_link_challenges') {
        throw new Error(`Unexpected table: ${table}`);
      }

      const filters: Record<string, unknown> = {};
      let operation: 'select' | 'update' = 'select';
      let updateValues: Record<string, unknown> = {};

      const builder = {
        select() {
          operation = 'select';
          return builder;
        },
        update(values: Record<string, unknown>) {
          operation = 'update';
          updateValues = values;
          return builder;
        },
        insert(values: Omit<Challenge, 'used_at'>) {
          challenges.push({ ...values, used_at: null });
          return Promise.resolve({ error: null });
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        is(column: string, value: unknown) {
          filters[column] = { is: value };
          return builder;
        },
        gt(column: string, value: unknown) {
          filters[column] = { gt: value };
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          const matches = challenges.filter((challenge) =>
            Object.entries(filters).every(([column, expected]) => {
              if (typeof expected === 'object' && expected !== null && 'is' in expected) {
                return challenge[column as keyof Challenge] === (expected as { is: unknown }).is;
              }
              if (typeof expected === 'object' && expected !== null && 'gt' in expected) {
                return new Date(String(challenge[column as keyof Challenge])).getTime() >
                  new Date(String((expected as { gt: unknown }).gt)).getTime();
              }
              return challenge[column as keyof Challenge] === expected;
            }),
          );

          if (operation === 'select') {
            return Promise.resolve({ data: matches[0] ?? null, error: null });
          }
          if (!matches[0]) return Promise.resolve({ data: null, error: null });
          Object.assign(matches[0], updateValues);
          return Promise.resolve({ data: { nonce: matches[0].nonce }, error: null });
        },
      };

      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      assertEquals(name, 'upsert_user_wallet_monotonic');
      writes.push(args);
      return Promise.resolve({ error: null });
    },
    nextNonce() {
      nonce += 1;
      return `test-nonce-${nonce}`;
    },
  };

  return { client, challenges, writes };
}

function request(body: Record<string, unknown>, ip = IP) {
  return new Request('https://oracle.example/functions/v1/user-wallet-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return await response.json() as Record<string, unknown>;
}

async function issueChallenge(handler: (request: Request) => Promise<Response>, store: ReturnType<typeof fakeSupabase>) {
  const response = await handler(request({ action: 'challenge' }));
  assertEquals(response.status, 200);
  const body = await responseBody(response);
  assertEquals(body.success, true);
  return { message: String(body.message), expiresAt: String(body.expires_at) };
}

Deno.test('accepts a valid challenge signature and writes wallet identity', async () => {
  const store = fakeSupabase();
  const handler = createWalletSyncHandler(store.client as never, () => NOW);
  const { message } = await issueChallenge(handler, store);
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);

  const response = await handler(request({
    action: 'upsert',
    onboarding_status: 'wallet_signed',
    wallet_address: wallet.address,
    message,
    signature,
  }));

  assertEquals(response.status, 200);
  assertEquals(store.writes, [{
    p_ip_address: IP,
    p_status: 'wallet_signed',
    p_wallet_address: wallet.address,
  }]);
});

Deno.test('rejects missing and malformed identity proof without writing', async () => {
  for (const body of [
    { action: 'upsert', onboarding_status: 'wallet_signed', wallet_address: Wallet.createRandom().address },
    {
      action: 'upsert',
      onboarding_status: 'wallet_signed',
      wallet_address: Wallet.createRandom().address,
      message: 'not a server challenge',
      signature: 'not a signature',
    },
  ]) {
    const store = fakeSupabase();
    const handler = createWalletSyncHandler(store.client as never, () => NOW);
    const response = await handler(request(body));
    assertEquals(response.status, body.message ? 401 : 400);
    assertEquals(store.writes.length, 0);
  }
});

Deno.test('rejects a mismatched wallet, expired challenge, and replay', async () => {
  const wallet = Wallet.createRandom();

  const mismatched = fakeSupabase();
  const mismatchedHandler = createWalletSyncHandler(mismatched.client as never, () => NOW);
  const { message } = await issueChallenge(mismatchedHandler, mismatched);
  const signature = await wallet.signMessage(message);
  const wrongCallerResponse = await mismatchedHandler(request({
    action: 'upsert',
    onboarding_status: 'wallet_signed',
    wallet_address: wallet.address,
    message,
    signature,
  }, '198.51.100.7'));
  assertEquals(wrongCallerResponse.status, 401);

  const mismatchResponse = await mismatchedHandler(request({
    action: 'upsert',
    onboarding_status: 'wallet_signed',
    wallet_address: Wallet.createRandom().address,
    message,
    signature,
  }));
  assertEquals(mismatchResponse.status, 401);
  assertEquals(mismatched.writes.length, 0);

  const expired = fakeSupabase([{
    nonce: 'expired',
    ip_address: IP,
    message: 'expired challenge',
    expires_at: new Date(NOW - 1).toISOString(),
    used_at: null,
  }]);
  const expiredHandler = createWalletSyncHandler(expired.client as never, () => NOW);
  const expiredResponse = await expiredHandler(request({
    action: 'upsert',
    onboarding_status: 'wallet_signed',
    wallet_address: wallet.address,
    message: 'expired challenge',
    signature: await wallet.signMessage('expired challenge'),
  }));
  assertEquals(expiredResponse.status, 401);
  assertEquals(expired.writes.length, 0);

  const replay = fakeSupabase();
  const replayHandler = createWalletSyncHandler(replay.client as never, () => NOW);
  const replayChallenge = await issueChallenge(replayHandler, replay);
  const replaySignature = await wallet.signMessage(replayChallenge.message);
  const payload = {
    action: 'upsert',
    onboarding_status: 'wallet_signed',
    wallet_address: wallet.address,
    message: replayChallenge.message,
    signature: replaySignature,
  };
  assertEquals((await replayHandler(request(payload))).status, 200);
  const replayResponse = await replayHandler(request(payload));
  assertEquals(replayResponse.status, 401);
  assertMatch(String((await responseBody(replayResponse)).error), /already used/);
  assertEquals(replay.writes.length, 1);
});

Deno.test('allows lifecycle status writes without identity signatures', async () => {
  const store = fakeSupabase();
  const handler = createWalletSyncHandler(store.client as never, () => NOW);

  for (const status of ['visited', 'lore_completed']) {
    const response = await handler(request({ action: 'upsert', onboarding_status: status }));
    assertEquals(response.status, 200);
  }

  assert(store.writes.length === 2);
  assertEquals(store.writes.map((write) => write.p_status), ['visited', 'lore_completed']);
  assertEquals(store.writes.every((write) => write.p_wallet_address === null), true);
});