import assert from 'node:assert/strict';
import { it } from 'node:test';
import { requestFacilityProof } from '../plugins/attendance/automatic-proof-request.ts';

it('aborts an unreachable gateway after three seconds', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const pending = requestFacilityProof('https://lan.example', 'ticket', new AbortController().signal,
    ((_url, init) => new Promise((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch);
  context.mock.timers.tick(2999); assert.equal(signal?.aborted, false);
  context.mock.timers.tick(1); assert.deepEqual(await pending, { kind: 'outside-lan' });
});
it('keeps authorization failures and view cancellation separate from outside LAN', async () => {
  const controller = new AbortController();
  assert.deepEqual(await requestFacilityProof('https://lan.example', 'ticket', controller.signal,
    (async () => new Response('{}', { status: 401 })) as typeof fetch), { kind: 'verification-failed' });
  controller.abort();
  assert.deepEqual(await requestFacilityProof('https://lan.example', 'ticket', controller.signal,
    (() => { throw Error('must not fetch'); }) as typeof fetch), { kind: 'cancelled' });
});
it('returns only a nonempty proof from a successful response', async () => {
  assert.deepEqual(await requestFacilityProof('https://lan.example', 'ticket', new AbortController().signal,
    (async () => Response.json({ attestation: 'signed-proof' })) as typeof fetch), { kind: 'proof', attestation: 'signed-proof' });
});
