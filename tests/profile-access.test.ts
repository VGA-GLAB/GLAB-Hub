import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getProfileAccess, profileAccessOf, profileInputUrl } from '../plugins/vantan-user/profile-access.ts';

const KEY = 'user_data.module:profile';

describe('profileAccessOf', () => {
  it('treats profile in optedOutModules as denied', () => {
    assert.equal(profileAccessOf({
      permissions: [{ key: KEY, allowed: true, state: 'granted' }],
      optedOutModules: ['profile'],
    }), 'denied');
  });

  it('adopts the declared permission state', () => {
    assert.equal(profileAccessOf({ permissions: [{ key: KEY, allowed: false, state: 'undecided' }], optedOutModules: [] }), 'undecided');
    assert.equal(profileAccessOf({ permissions: [{ key: KEY, allowed: false, state: 'denied' }], optedOutModules: [] }), 'denied');
    assert.equal(profileAccessOf({ permissions: [{ key: KEY, allowed: true, state: 'granted' }], optedOutModules: [] }), 'granted');
  });

  it('is granted when the new response has no profile declaration and no opt-out', () => {
    assert.equal(profileAccessOf({ permissions: [{ key: 'user_data.module:presence', allowed: true, state: 'granted' }], optedOutModules: [] }), 'granted');
  });

  it('is unknown for an old Cernere response without state', () => {
    assert.equal(profileAccessOf({ permissions: [{ key: KEY, allowed: true, purpose: null }] }), 'unknown');
    assert.equal(profileAccessOf({ permissions: [] }), 'unknown');
  });

  it('is unknown for malformed responses', () => {
    assert.equal(profileAccessOf(null), 'unknown');
    assert.equal(profileAccessOf('denied'), 'unknown');
    assert.equal(profileAccessOf({ permissions: [{ key: KEY, state: 'maybe' }], optedOutModules: [] }), 'unknown');
    assert.equal(profileAccessOf({ permissions: 'x', optedOutModules: [1] }), 'unknown');
  });
});

describe('getProfileAccess', () => {
  it('asks managed_project.get_user_permissions for the user', async () => {
    const calls: unknown[][] = [];
    const access = await getProfileAccess({
      call: async (...args: unknown[]) => { calls.push(args); return { permissions: [], optedOutModules: ['profile'] }; },
    } as never, 'user-1');
    assert.equal(access, 'denied');
    assert.deepEqual(calls, [['managed_project', 'get_user_permissions', { userId: 'user-1' }]]);
  });

  it('falls back to unknown when Cernere fails', async () => {
    const access = await getProfileAccess({ call: async () => { throw new Error('down'); } } as never, 'user-1');
    assert.equal(access, 'unknown');
  });
});

describe('profileInputUrl', () => {
  it('points at the Cernere service permission page', () => {
    assert.equal(profileInputUrl('https://cr.example.test/'), 'https://cr.example.test/data-optout');
    assert.equal(profileInputUrl('http://127.0.0.1:5173/app'), 'http://127.0.0.1:5173/data-optout');
  });

  it('rejects non-HTTP schemes and credentials', () => {
    assert.equal(profileInputUrl('javascript:alert(1)'), null);
    assert.equal(profileInputUrl('https://user:pass@cr.example.test'), null);
    assert.equal(profileInputUrl('not a url'), null);
  });

  it('is null when unset', () => {
    assert.equal(profileInputUrl(undefined), null);
    assert.equal(profileInputUrl('  '), null);
  });
});
