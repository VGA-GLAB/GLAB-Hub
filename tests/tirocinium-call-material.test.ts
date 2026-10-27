import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_MATERIAL_BYTES, materialMime, parseCallStart } from '../plugins/tirocinium/call-material.ts';

const material = { kind: 'es', mime: 'application/pdf', data_base64: Buffer.from('%PDF').toString('base64') };

test('a call starts with or without one submitted material', () => {
  assert.deepEqual(parseCallStart(null), { material: null });
  assert.deepEqual(parseCallStart({}), { material: null });
  assert.deepEqual(parseCallStart({ material }), { material });
});

test('unknown fields, kinds and types are rejected instead of forwarded', () => {
  assert.equal(parseCallStart({ material, extra: 1 }), null);
  assert.equal(parseCallStart({ material: { ...material, file_name: 'a.pdf' } }), null);
  assert.equal(parseCallStart({ material: { ...material, kind: 'resume' } }), null);
  assert.equal(parseCallStart({ material: { ...material, mime: 'application/zip' } }), null);
  assert.equal(parseCallStart({ material: { ...material, data_base64: '' } }), null);
  assert.equal(parseCallStart({ material: { ...material, data_base64: 'not base64!' } }), null);
  assert.equal(parseCallStart([]), null);
});

test('material over the transfer cap is rejected', () => {
  const big = 'A'.repeat(Math.ceil(((MAX_MATERIAL_BYTES + 1024) * 4) / 3));
  assert.equal(parseCallStart({ material: { ...material, data_base64: big } }), null);
});

test('the browser picks a supported type even when the file type is empty', () => {
  assert.equal(materialMime({ name: 'es.md', type: '' }), 'text/markdown');
  assert.equal(materialMime({ name: 'es.TXT', type: '' }), 'text/plain');
  assert.equal(materialMime({ name: 'p.pdf', type: 'application/pdf' }), 'application/pdf');
  assert.equal(materialMime({ name: 'p.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), null);
});
