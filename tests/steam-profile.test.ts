import assert from 'node:assert/strict';
import { test } from 'node:test';
import { steamProfileInputSchema, translateSteamProfile } from '../plugins/vantan-user/steam-profile-schema.ts';
import { getSteamProfile, setSteamProfile } from '../plugins/vantan-user/steam-profile-client.ts';
import { registrationInputSchema, saveRegistration } from '../plugins/vantan-user/registration.ts';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';

const privateProfile = { steamId: null, playedGamesPublic: false, steamIdPublic: false };
const requiredProfile = { name: 'Player', roleTitle: 'Student', departmentName: 'Games' };
const id = '76561198000000001';
function fakeClient(): { client: CernereProjectApi; writes: unknown[][] } {
  const writes: unknown[][] = [];
  return { writes, client: {
    getUserData: async () => ({}),
    setUserData: async (...args) => { writes.push(args); },
    call: async () => assert.fail('Not expected'),
  } };
}

test('Steam ID is optional, remains exact text, and rejects numbers and profile URLs', () => {
  assert.deepEqual(steamProfileInputSchema.parse({ ...privateProfile, steamId: '  ' }), privateProfile);
  assert.equal(steamProfileInputSchema.parse({ ...privateProfile, steamId: ' ' + id + ' ' }).steamId, id);
  for (const steamId of [Number(id), '123', 'https://steamcommunity.com/profiles/' + id]) {
    assert.equal(steamProfileInputSchema.safeParse({ ...privateProfile, steamId }).success, false);
  }
  assert.equal(steamProfileInputSchema.safeParse({ ...privateProfile, userId: 'other' }).success, false);
  assert.equal(steamProfileInputSchema.safeParse({ ...privateProfile, playedGamesPublic: 'true' }).success, false);
});

test('each publication choice is independent; legacy and malformed grants stay private', () => {
  assert.deepEqual(translateSteamProfile({}), privateProfile);
  assert.deepEqual(translateSteamProfile({ played_games_public: 'true', steam_id_public: 1 }), privateProfile);
  for (const playedGamesPublic of [false, true]) for (const steamIdPublic of [false, true]) {
    assert.deepEqual(translateSteamProfile({ steam_id: id, played_games_public: playedGamesPublic,
      steam_id_public: steamIdPublic }), { steamId: id, playedGamesPublic, steamIdPublic });
  }
  assert.throws(() => translateSteamProfile(null));
  assert.throws(() => translateSteamProfile({ steam_id: Number(id) }));
});

test('Cr reads and writes only the three Volputas columns, including revocation and clearing', async () => {
  const { client, writes } = fakeClient();
  client.getUserData = async (userId, project, columns) => {
    assert.equal(userId, 'owner');
    assert.equal(project, 'volputas');
    assert.deepEqual(columns, ['steam_id', 'played_games_public', 'steam_id_public']);
    return { steam_id: id, played_games_public: true, steam_id_public: false };
  };
  assert.equal((await getSteamProfile(client, 'owner')).steamIdPublic, false);
  await setSteamProfile(client, 'owner', privateProfile);
  assert.deepEqual(writes, [['owner', 'volputas', {
    steam_id: null, played_games_public: false, steam_id_public: false,
  }]]);
});

test('old registration payloads leave Steam settings untouched', async () => {
  const { client, writes } = fakeClient();
  await saveRegistration(client, 'owner', registrationInputSchema.parse(requiredProfile));
  assert.deepEqual(writes, [['owner', 'vantan_user', {
    name: 'Player', role_title: 'Student', department_name: 'Games',
  }]]);
});

test('optional Steam saves before the registration gate, and a failure cannot complete it', async () => {
  const { client, writes } = fakeClient();
  const input = registrationInputSchema.parse({ ...requiredProfile, steamProfile: privateProfile });
  await saveRegistration(client, 'owner', input);
  assert.deepEqual(writes.map((row) => row[1]), ['volputas', 'vantan_user']);
  writes.length = 0;
  client.setUserData = async (_userId, project) => {
    writes.push([project]);
    throw new Error('Cr unavailable');
  };
  await assert.rejects(saveRegistration(client, 'owner', input), /Cr unavailable/);
  assert.deepEqual(writes, [['volputas']]);
});
