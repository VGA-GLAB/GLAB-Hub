import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { requireServiceToken } from '../projects/service-auth.ts';
import { noStore } from '../shared.ts';
import { listAvailable, resolveDiscordId, setAvailability, type AvailableMember } from './presence-client.ts';

const consultSchema = z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(8_000) }).strict();
const availabilitySchema = z.object({ availableNow: z.boolean(), hours: z.number().positive().max(24).optional() }).strict();
const discordSchema = z.object({ discordId: z.string().min(1).max(32) }).strict();
const postedSchema = z.object({ threadId: z.string().min(1).max(64), messageId: z.string().min(1).max(64) }).strict();
const CREATE_WINDOW_MS = 60_000;

interface ConsultRow { id: string; title: string; body: string; status: 'open' | 'resolved'; thread_id: string | null; created_by: string; created_at: number; resolved_at: number | null; posted_at: number | null; invited_json: string | null; resolved_posted_at: number | null; }

function consultView(row: ConsultRow): Record<string, unknown> {
  return { id: row.id, title: row.title, body: row.body, status: row.status, threadId: row.thread_id, createdBy: row.created_by, createdAt: row.created_at, resolvedAt: row.resolved_at };
}

function unavailable(ctx: CorpusContext, error: unknown) {
  ctx.logger.error(`consult presence request failed: ${error instanceof Error ? error.message : String(error)}`);
  return { error: 'cernere_unavailable' };
}

const consultModule: CorpusModule = {
  id: 'consult', title: '相談', icon: '🗣️',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const client = createCernereProjectClient(ctx);
    const r = new Hono();
    r.post('/consults', async (c) => {
      const parsed = consultSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_consult' }, 400);
      const identity = getIdentity(c);
      const recent = ctx.db.prepare('SELECT id FROM glab_consult WHERE created_by = ? AND created_at > ? LIMIT 1').get(identity.userId, Date.now() - CREATE_WINDOW_MS);
      if (recent) return c.json({ error: 'rate_limited' }, 429);
      let invited: AvailableMember[] = [];
      try { invited = await listAvailable(client); } catch (error) { return c.json(unavailable(ctx, error), 503); }
      const id = crypto.randomUUID();
      ctx.db.prepare(`INSERT INTO glab_consult (id, title, body, status, created_by, created_at, invited_json)
        VALUES (?, ?, ?, 'open', ?, ?, ?)`).run(id, parsed.data.title, parsed.data.body, identity.userId, Date.now(), JSON.stringify(invited));
      const row = ctx.db.prepare('SELECT * FROM glab_consult WHERE id = ?').get(id) as ConsultRow;
      return c.json({ consult: consultView(row) }, 201);
    });
    r.get('/consults', (c) => {
      const status = c.req.query('status') === 'resolved' ? 'resolved' : 'open';
      const rows = ctx.db.prepare('SELECT * FROM glab_consult WHERE status = ? ORDER BY created_at DESC').all(status) as ConsultRow[];
      return c.json({ consults: rows.map(consultView) });
    });
    r.get('/consults/:id', (c) => {
      const row = ctx.db.prepare('SELECT * FROM glab_consult WHERE id = ?').get(c.req.param('id')) as ConsultRow | undefined;
      return row ? c.json({ consult: consultView(row) }) : c.json({ error: 'not_found' }, 404);
    });
    r.post('/consults/:id/resolve', (c) => {
      const identity = getIdentity(c);
      const row = ctx.db.prepare('SELECT * FROM glab_consult WHERE id = ?').get(c.req.param('id')) as ConsultRow | undefined;
      if (!row) return c.json({ error: 'not_found' }, 404);
      if (row.created_by !== identity.userId && !identity.isAdmin) return c.json({ error: 'forbidden' }, 403);
      ctx.db.prepare("UPDATE glab_consult SET status = 'resolved', resolved_at = ? WHERE id = ?").run(Date.now(), row.id);
      return c.json({ ok: true });
    });
    r.get('/availability', async (c) => {
      try {
        const self = getIdentity(c).userId;
        const available = await listAvailable(client);
        return c.json({ availableNow: available.some((member) => member.userId === self) });
      } catch (error) { return c.json(unavailable(ctx, error), 503); }
    });
    r.put('/availability', async (c) => {
      const parsed = availabilitySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success || (parsed.data.availableNow && !parsed.data.hours)) return c.json({ error: 'invalid_availability' }, 400);
      const until = parsed.data.availableNow ? new Date(Date.now() + parsed.data.hours! * 3_600_000).toISOString() : null;
      try { await setAvailability(client, getIdentity(c).userId, parsed.data.availableNow, until); return c.json({ ok: true, availableUntil: until }); }
      catch (error) { return c.json(unavailable(ctx, error), 503); }
    });
    r.get('/available-members', async (c) => {
      const identity = getIdentity(c);
      if (!identity.isAdmin) return c.json({ error: 'forbidden' }, 403);
      try { return c.json({ members: await listAvailable(client) }); } catch (error) { return c.json(unavailable(ctx, error), 503); }
    });

    // The mounted endpoints include /external/presence and /external/presence/resolve.
    const external = new Hono();
    external.use('*', requireServiceToken(ctx.env('GLAB_PROJECTS_SERVICE_TOKEN')));
    external.post('/presence/resolve', async (c) => {
      noStore(c); const parsed = discordSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_discord_id' }, 400);
      try { return c.json(await resolveDiscordId(client, parsed.data.discordId)); } catch (error) { return c.json(unavailable(ctx, error), 503); }
    });
    external.post('/presence', async (c) => {
      noStore(c); const parsed = discordSchema.merge(availabilitySchema).safeParse(await c.req.json().catch(() => null));
      if (!parsed.success || (parsed.data.availableNow && !parsed.data.hours)) return c.json({ error: 'invalid_availability' }, 400);
      try {
        const member = await resolveDiscordId(client, parsed.data.discordId);
        if (!member) return c.json(null);
        const until = parsed.data.availableNow ? new Date(Date.now() + parsed.data.hours! * 3_600_000).toISOString() : null;
        await setAvailability(client, member.userId, parsed.data.availableNow, until);
        return c.json({ ok: true, availableUntil: until });
      } catch (error) { return c.json(unavailable(ctx, error), 503); }
    });
    external.get('/consults/pending', (c) => {
      noStore(c); const rows = ctx.db.prepare('SELECT * FROM glab_consult WHERE posted_at IS NULL AND status = \'open\' ORDER BY created_at ASC').all() as ConsultRow[];
      return c.json({ consults: rows.map((row) => ({ ...consultView(row), invited: parseInvited(row.invited_json) })) });
    });
    // 解決済み × スレッド作成済み × bot 未処理のものだけを返す。 ack (下の
    // resolved-posted) を受けた相談を返し続けると、 bot が毎 tick 同じスレッドを
    // 再アーカイブしてしまう。
    external.get('/consults/resolved', (c) => {
      noStore(c); const rows = ctx.db.prepare("SELECT * FROM glab_consult WHERE status = 'resolved' AND thread_id IS NOT NULL AND resolved_posted_at IS NULL").all() as ConsultRow[];
      return c.json({ consults: rows.map((row) => ({ id: row.id, threadId: row.thread_id })) });
    });
    external.post('/consults/:id/resolved-posted', (c) => {
      noStore(c);
      const changed = ctx.db.prepare('UPDATE glab_consult SET resolved_posted_at = ? WHERE id = ? AND resolved_posted_at IS NULL').run(Date.now(), c.req.param('id')).changes;
      return changed ? c.json({ ok: true }) : c.json({ error: 'not_found_or_already_resolved' }, 404);
    });
    external.post('/consults/:id/posted', async (c) => {
      noStore(c); const parsed = postedSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_posted_record' }, 400);
      const changed = ctx.db.prepare('UPDATE glab_consult SET posted_at = ?, thread_id = ? WHERE id = ? AND posted_at IS NULL').run(Date.now(), parsed.data.threadId, c.req.param('id')).changes;
      return changed ? c.json({ ok: true }) : c.json({ error: 'not_found_or_already_posted' }, 404);
    });
    r.route('/external', external);
    ctx.registerRoute(r);
    ctx.registerPanel({ title: '相談', icon: '🗣️' });
  },
};

function parseInvited(value: string | null): AvailableMember[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isAvailableMember) : [];
  } catch { return []; }
}

function isAvailableMember(value: unknown): value is AvailableMember {
  return !!value && typeof value === 'object' && typeof (value as AvailableMember).userId === 'string' && typeof (value as AvailableMember).displayName === 'string' && (typeof (value as AvailableMember).discordId === 'string' || (value as AvailableMember).discordId === null);
}

export default consultModule;
