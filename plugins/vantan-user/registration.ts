import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { vantanUserInputSchema } from './profile-schema.ts';
import { setVantanUserProfile } from './profile-client.ts';
import { steamProfileInputSchema } from './steam-profile-schema.ts';
import { setSteamProfile } from './steam-profile-client.ts';
import type { z } from 'zod';

export const registrationInputSchema = vantanUserInputSchema.extend({
  steamProfile: steamProfileInputSchema.optional(),
});

export async function saveRegistration(
  client: CernereProjectApi, userId: string, input: z.output<typeof registrationInputSchema>,
): Promise<void> {
  // Save optional data first: a failure must not mark the mandatory gate complete.
  // Separate Cr projects cannot be committed atomically; retrying is idempotent.
  if (input.steamProfile !== undefined) await setSteamProfile(client, userId, input.steamProfile);
  await setVantanUserProfile(client, userId, input);
}
