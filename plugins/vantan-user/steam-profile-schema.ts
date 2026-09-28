import { z } from 'zod';

/** SteamID64 stays a string: converting it to Number loses precision. */
export const steamProfileInputSchema = z.object({
  steamId: z.string().trim().regex(/^(?:[0-9]{17})?$/, 'Steam IDは17桁の数字で入力してください')
    .nullable().transform((value) => value || null),
  playedGamesPublic: z.boolean(),
  steamIdPublic: z.boolean(),
}).strict();

export type SteamProfile = z.output<typeof steamProfileInputSchema>;

export function translateSteamProfile(raw: unknown): SteamProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid Steam profile response');
  }
  const row = raw as Record<string, unknown>;
  const parsed = steamProfileInputSchema.safeParse({
    steamId: row.steam_id ?? null,
    // Only a literal true is a publication grant, including for legacy rows.
    playedGamesPublic: row.played_games_public === true,
    steamIdPublic: row.steam_id_public === true,
  });
  if (!parsed.success) throw new Error('Invalid Steam profile response');
  return parsed.data;
}
