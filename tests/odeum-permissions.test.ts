import assert from 'node:assert/strict';
import test from 'node:test';
import { canEndPresentation, canStartPresentation } from '../plugins/odeum/permissions.ts';
import contract from '../contracts/odeum-permissions.contract.ts';

const event = { created_by: 'creator' };

test('only the event creator or a GLab admin may start a presentation', () => {
  const cases: Array<[{ userId: string; isAdmin: boolean }, boolean]> = [
    [{ userId: 'creator', isAdmin: false }, true],
    [{ userId: 'someone', isAdmin: true }, true],
    [{ userId: 'someone', isAdmin: false }, false],
    [{ userId: '', isAdmin: false }, false],
  ];
  for (const [actor, expected] of cases) {
    const result = canStartPresentation(event, actor);
    assert.equal(result, expected, actor.userId);
    assert.equal(contract.post(result, event, actor), true);
  }
});

test('presenters can always end their own session, even if the event is gone', () => {
  const session = { presenterUserId: 'presenter' };
  assert.equal(canEndPresentation(session, null, { userId: 'presenter', isAdmin: false }), true);
  assert.equal(canEndPresentation(session, event, { userId: 'creator', isAdmin: false }), true);
  assert.equal(canEndPresentation(session, null, { userId: 'admin', isAdmin: true }), true);
  assert.equal(canEndPresentation(session, event, { userId: 'viewer', isAdmin: false }), false);
  assert.equal(canEndPresentation(session, null, { userId: 'creator', isAdmin: false }), false);
});
