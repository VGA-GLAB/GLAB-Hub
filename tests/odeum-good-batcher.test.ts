import assert from 'node:assert/strict';
import test from 'node:test';
import { GoodBatcher, takeGoodBatch, type BatchTimer } from '../plugins/odeum/good-batcher.ts';
import contract from '../contracts/odeum-good-batcher.contract.ts';

/** 手で進める偽タイマー。 */
class ManualTimer implements BatchTimer {
  now = 0;
  private queue: Array<{ at: number; callback: () => void; id: number }> = [];
  private nextId = 1;

  set(callback: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.queue.push({ at: this.now + ms, callback, id });
    return id;
  }

  clear(handle: unknown): void {
    this.queue = this.queue.filter((entry) => entry.id !== handle);
  }

  get scheduled(): number {
    return this.queue.length;
  }

  advance(ms: number): void {
    const until = this.now + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const next = this.queue[0];
      if (!next || next.at > until) break;
      this.queue.shift();
      this.now = next.at;
      next.callback();
    }
    this.now = until;
  }
}

test('presses within 200ms are sent as one good message', () => {
  const timer = new ManualTimer();
  const sent: Array<{ at: number; count: number }> = [];
  const batcher = new GoodBatcher((count) => sent.push({ at: timer.now, count }), timer);
  assert.equal(batcher.press(), 1);
  timer.advance(50);
  batcher.press();
  timer.advance(50);
  assert.equal(batcher.press(), 3, '押下数は即座に増える');
  assert.deepEqual(sent, [], '200ms 経つまでは送らない');
  timer.advance(100);
  assert.deepEqual(sent, [{ at: 200, count: 3 }]);
  assert.equal(batcher.queued, 0);
  assert.equal(timer.scheduled, 0, '押下が無ければタイマーは止まる');
});

test('consecutive windows each send at most one message', () => {
  const timer = new ManualTimer();
  const sent: Array<{ at: number; count: number }> = [];
  const batcher = new GoodBatcher((count) => sent.push({ at: timer.now, count }), timer);
  for (let i = 0; i < 5; i += 1) {
    batcher.press();
    timer.advance(100);
  }
  timer.advance(200);
  assert.deepEqual(sent, [{ at: 200, count: 2 }, { at: 400, count: 2 }, { at: 600, count: 1 }]);
  assert.equal(sent.reduce((sum, entry) => sum + entry.count, 0) + batcher.queued, batcher.pressed);
});

test('more than 50 presses are carried over to the next window', () => {
  const timer = new ManualTimer();
  const sent: number[] = [];
  const batcher = new GoodBatcher((count) => sent.push(count), timer);
  for (let i = 0; i < 120; i += 1) batcher.press();
  timer.advance(200);
  assert.deepEqual(sent, [50]);
  timer.advance(400);
  assert.deepEqual(sent, [50, 50, 20]);
  assert.equal(sent.reduce((sum, count) => sum + count, 0) + batcher.queued, batcher.pressed);
});

test('dispose stops sending pending presses', () => {
  const timer = new ManualTimer();
  const sent: number[] = [];
  const batcher = new GoodBatcher((count) => sent.push(count), timer);
  batcher.press();
  batcher.dispose();
  timer.advance(1_000);
  assert.deepEqual(sent, []);
  assert.equal(timer.scheduled, 0);
  assert.equal(batcher.press(), 1, '破棄後の押下は数えない');
});

test('takeGoodBatch splits pending presses into 1..50 per message', () => {
  for (const [pending, expected] of [[0, { count: 0, rest: 0 }], [1, { count: 1, rest: 0 }], [50, { count: 50, rest: 0 }], [120, { count: 50, rest: 70 }]] as const) {
    const result = takeGoodBatch(pending);
    assert.deepEqual(result, expected);
    assert.equal(contract.post(result, pending), true);
  }
});
