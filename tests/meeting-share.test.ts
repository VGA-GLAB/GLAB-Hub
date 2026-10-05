import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestResponseLabel, meetingShareUrl } from '../plugins/facility/meeting-share.ts';

test('share URL points at the Aedilis meeting page only for public meetings', () => {
  assert.equal(meetingShareUrl('https://ae.example.com/base', { id: 'abc-1', visibility: 'public' }), 'https://ae.example.com/meeting/abc-1');
  assert.equal(meetingShareUrl('https://ae.example.com', { id: 'abc-1', visibility: 'internal' }), null);
  assert.equal(meetingShareUrl('https://ae.example.com', { id: 'abc-1', visibility: 'private' }), null);
  assert.equal(meetingShareUrl(undefined, { id: 'abc-1', visibility: 'public' }), null);
  assert.equal(meetingShareUrl('javascript:alert(1)', { id: 'abc-1', visibility: 'public' }), null);
  assert.equal(meetingShareUrl('not a url', { id: 'abc-1', visibility: 'public' }), null);
  assert.equal(meetingShareUrl('https://ae.example.com', { id: '../x?y', visibility: 'public' }), 'https://ae.example.com/meeting/..%2Fx%3Fy');
});

test('guest label reflects the Aedilis setting only where guests can read the meeting', () => {
  assert.equal(guestResponseLabel({ id: 'a', visibility: 'public', guestResponses: true }), 'ログインなしで回答可');
  assert.equal(guestResponseLabel({ id: 'a', visibility: 'internal', guestResponses: true }), '回答はログインが必要');
  assert.equal(guestResponseLabel({ id: 'a', visibility: 'public' }), '回答はログインが必要');
});
