import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { translateSteamProfile, type SteamProfile } from './steam-profile-schema.ts';

const PROJECT = 'volputas';
const COLUMNS = ['steam_id', 'played_games_public', 'steam_id_public'];

export async function getSteamProfile(client: CernereProjectApi, userId: string): Promise<SteamProfile> {
  return translateSteamProfile(await client.getUserData(userId, PROJECT, [...COLUMNS]));
}

export async function setSteamProfile(
  client: CernereProjectApi, userId: string, profile: SteamProfile,
): Promise<void> {
  await client.setUserData(userId, PROJECT, {
    steam_id: profile.steamId,
    played_games_public: profile.playedGamesPublic,
    steam_id_public: profile.steamIdPublic,
  });
}
