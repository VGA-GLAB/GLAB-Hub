import assert from 'node:assert/strict';
import { it } from 'node:test';
import { initHmr, isHmrConnectionStale } from '../public/src/hmr.ts';

it('resume health follows the existing HMR stream without creating duplicate connections', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
  const streams: FakeSource[] = [];
  class FakeSource {
    static OPEN = 1;
    readyState = 0;
    constructor(readonly url: string) { streams.push(this); }
    addEventListener(): void {}
  }
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: FakeSource });
  try {
    assert.equal(isHmrConnectionStale(), false);
    initHmr(); initHmr();
    assert.equal(streams.length, 1);
    assert.equal(streams[0]!.url, '/ui-hmr');
    assert.equal(isHmrConnectionStale(), true);
    streams[0]!.readyState = 1;
    assert.equal(isHmrConnectionStale(), false);
    streams[0]!.readyState = 2;
    assert.equal(isHmrConnectionStale(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'EventSource', original);
    else Reflect.deleteProperty(globalThis, 'EventSource');
  }
});
