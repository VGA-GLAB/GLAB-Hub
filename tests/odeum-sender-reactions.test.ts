import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerMessage, validateReactionText } from '../plugins/odeum/viewer-protocol.ts';

const post = { type: 'submission', text: '<script>plain text</script>', category: 'question', show_on_screen: true,
  from: { sub: 'viewer', name: 'Viewer' }, at: 1 };

test('private or ambiguous visibility never reaches viewer rendering', () => {
  for (const visibility of [false, undefined, null, 'true', 1]) {
    assert.equal(parseServerMessage(JSON.stringify({ ...post, show_on_screen: visibility })), null);
  }
  assert.deepEqual(parseServerMessage(JSON.stringify(post)), post);
});

test('malformed public posts and telops are rejected at the socket boundary', () => {
  for (const fields of [{ text: '' }, { text: 'x'.repeat(281) }, { category: 'other' }, { from: null }, { at: -1 }]) {
    assert.equal(parseServerMessage(JSON.stringify({ ...post, ...fields })), null);
  }
  assert.equal(parseServerMessage(JSON.stringify({ ...post, type: 'telop', text: 'x'.repeat(61) })), null);
  assert.equal(parseServerMessage(JSON.stringify({ ...post, type: 'telop', text: '👏'.repeat(60) }))?.type, 'telop');
});

test('Unicode length is bounded without silently truncating a draft', () => {
  assert.equal(validateReactionText('  hello  ', 60), 'hello');
  assert.equal(validateReactionText('👏'.repeat(60), 60), '👏'.repeat(60));
  assert.equal(validateReactionText('👏'.repeat(61), 60), null);
  assert.equal(validateReactionText(' \n ', 60), null);
  assert.equal(validateReactionText('\ud800', 60), null);
});
