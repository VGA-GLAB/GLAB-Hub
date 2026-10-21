import { z } from 'zod';
import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import type { SqlDb } from '../data.ts';
import { recordRegistration } from './store.ts';

const pageSchema = z.object({
  registrations: z.array(z.object({ userId: z.string().uuid(), createdAt: z.string().datetime({ offset: true }) })).max(100),
  next: z.string().uuid().nullable(),
});

/** Poll committed Cr registration hooks; replay is safe and a completed pass
 * starts over to catch UUIDs inserted behind the cursor during the previous pass.
 * @implements SPEC-GLAB-ADMISSION-002
 */
export async function syncRegistrations(db: SqlDb, client: CernereProjectApi): Promise<number> {
  const state = db.prepare('SELECT cursor, enabled_at FROM glab_admission_sync WHERE id = 1').get() as { cursor: string | null; enabled_at: number };
  const page = pageSchema.parse(await client.call('managed_project', 'list_registrations', state.cursor ? { after: state.cursor } : {}));
  for (const registration of page.registrations) {
    const createdAt = Date.parse(registration.createdAt);
    recordRegistration(db, registration.userId, createdAt);
    // Existing accounts still need approval, but rollout must not mass-mention
    // the administrator for registrations that predate this feature.
    if (createdAt < state.enabled_at) db.prepare("UPDATE glab_admission SET notification_state = 'sent' WHERE user_id = ? AND notification_state = 'pending'").run(registration.userId);
  }
  db.prepare('UPDATE glab_admission_sync SET cursor = ? WHERE id = 1').run(page.next);
  return page.registrations.length;
}
