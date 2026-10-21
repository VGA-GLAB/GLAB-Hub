import type { Client } from 'discord.js';
import type { SqlDb } from '../../plugins/data.ts';
import type { BotConfig } from '../config.ts';
import { glabExternal } from '../glab-api.ts';

/** Persist sending before network I/O: unknown delivery is held for inspection,
 * never automatically sent again after a timeout or process restart.
 * @implements SPEC-GLAB-ADMISSION-002
 */
export async function notifyAdmissions(client: Client, db: SqlDb, cfg: BotConfig): Promise<void> {
  const target = cfg.admissionNotification;
  if (!target || !/^\d{17,20}$/.test(target.channelId) || !/^\d{17,20}$/.test(target.mentionUserId)) {
    throw new Error('GLAB_ADMISSION_CHANNEL_ID and GLAB_ADMISSION_MENTION_USER_ID are required');
  }
  const url = new URL(target.publicUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('GLAB_PUBLIC_URL must be a public HTTP URL');
  const synced = await glabExternal(cfg, '/external/sync', { module: 'access', method: 'POST' });
  if (!synced.ok) throw new Error('Cernere registration synchronization unavailable');
  const rows = db.prepare("SELECT user_id FROM glab_admission WHERE notification_state = 'pending' AND status = 'pending' ORDER BY requested_at LIMIT 10").all() as { user_id: string }[];
  if (!rows.length) return;
  const channel = await client.channels.fetch(target.channelId);
  if (!channel || !channel.isTextBased() || !('send' in channel)) throw new Error('Admission channel is not writable');
  for (const row of rows) {
    const claimed = db.prepare("UPDATE glab_admission SET notification_state = 'sending' WHERE user_id = ? AND notification_state = 'pending'").run(row.user_id);
    if (Number(claimed.changes) !== 1) continue;
    const message = await channel.send({
      content: `<@${target.mentionUserId}> GLabの新規利用登録がありました。利用資格を確認して承認してください。\n${url.href}`,
      allowedMentions: { parse: [], users: [target.mentionUserId], roles: [], repliedUser: false },
    });
    db.prepare("UPDATE glab_admission SET notification_state = 'sent', notification_id = ? WHERE user_id = ? AND notification_state = 'sending'")
      .run(message.id, row.user_id);
  }
}
