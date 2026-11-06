/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readUploadResult } from '../plugins/upload-result.ts';

test('upload results retain exact bytes and status within the independent64KiB bound', async () => {
  const body = new Uint8Array([255, 0, 13, 10]);
  const result = await readUploadResult(new Response(body, { status: 201, headers: { 'content-type': 'application/octet-stream' } }));
  assert.equal(result.status, 201); assert.deepEqual(new Uint8Array(await result.arrayBuffer()), body);
  assert.equal((await readUploadResult(new Response(null, { status: 204 }))).status, 204);
});
test('oversize results cancel the response instead of retaining unbounded private memory', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
  await assert.rejects(readUploadResult(new Response(body)), /bound/); assert.equal(cancelled, true);
});
test('disconnect cancels a stalled result reader', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), owner = new AbortController();
  const result = readUploadResult(new Response(body), owner.signal); owner.abort();
  await assert.rejects(result); assert.equal(cancelled, true);
});
