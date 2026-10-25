import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCallInput } from '../plugins/tirocinium/call-input.ts';

test('voice boundary rejects malformed, oversized and out-of-order audio', () => {
  for (const value of [null, [], { kind: 'audio_chunk', pcm: [0, 256], seq: 0 },
    { kind: 'audio_chunk', pcm: [0, -1], seq: 0 },
    { kind: 'audio_chunk', pcm: [0, 1.1], seq: 0 },
    { kind: 'audio_chunk', pcm: [0], seq: 0 },
    { kind: 'audio_chunk', pcm: new Array(8002).fill(0), seq: 0 },
    { kind: 'audio_chunk', pcm: [0, 0], seq: 1 },
    { kind: 'audio_chunk', pcm: [], seq: 0 },
    { kind: 'start_interview', userId: 'someone-else' },
    { kind: 'stt_final', text: 'unexpected bypass' }]) {
    assert.equal(parseCallInput(value, 0), null);
  }
  assert.deepEqual(parseCallInput({ kind: 'audio_chunk', pcm: [0, 255], seq: 3 }, 3),
    { kind: 'audio_chunk', pcm: [0, 255], seq: 3 });
  assert.deepEqual(parseCallInput({ kind: 'barge_in' }, 0), { kind: 'barge_in' });
});
