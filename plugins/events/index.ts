// GLAB モジュール 3: イベント (events)。
//
// 自前データ。 GLAB の集会 / 勉強会 / 締切などのイベントを Web hub で登録・管理する。
// 登録されたイベントは Discord Bot (bot/) が同じ DB を読んで #event チャンネルへ
// 通知・リマインドする (DESIGN.md §4)。 スキーマ / クエリは plugins/data.ts に集約。

import { Hono, getIdentity, cacheDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext, CorpusDb } from '../../corpus/server/hub/sdk.ts';
import {
  ensureSchema,
  createEvent,
  listEvents,
  getEvent,
  deleteEvent,
  type EventRow,
} from '../data.ts';

function eventView(row: EventRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    location: row.location,
    startsAt: row.starts_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    notified: row.notified_at != null,
  };
}

function makeRoutes(db: CorpusDb): Hono {
  const r = new Hono();

  // 今後のイベント (?all=1 で過去含む全件)
  r.get('/', (c) => {
    const includePast = c.req.query('all') === '1';
    return c.json({ events: listEvents(db, includePast).map(eventView) });
  });

  // イベント登録 (認証ユーザなら誰でも)
  r.post('/', async (c) => {
    const id = getIdentity(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      body?: string;
      location?: string;
      startsAt?: number | string;
    };
    const title = (body.title ?? '').trim();
    if (!title) return c.json({ error: 'title_required' }, 422);
    const startsAt =
      typeof body.startsAt === 'string' ? Date.parse(body.startsAt) : Number(body.startsAt);
    if (!Number.isFinite(startsAt)) return c.json({ error: 'starts_at_required' }, 422);

    const eventId = createEvent(db, {
      title,
      body: (body.body ?? '').trim() || null,
      location: (body.location ?? '').trim() || null,
      startsAt,
      createdBy: id.userId,
    });
    if (id.displayName) cacheDisplayName(db, id.userId, id.displayName);
    const created = getEvent(db, eventId);
    return c.json({ ok: true, event: created ? eventView(created) : null });
  });

  // イベント削除 (登録者 or admin)
  r.delete('/:id', (c) => {
    const id = getIdentity(c);
    const eventId = Number(c.req.param('id'));
    const ev = getEvent(db, eventId);
    if (!ev) return c.json({ error: 'not_found' }, 404);
    if (ev.created_by !== id.userId && !id.isAdmin) {
      return c.json({ error: 'forbidden' }, 403);
    }
    deleteEvent(db, eventId);
    return c.json({ ok: true });
  });

  return r;
}

const eventsModule: CorpusModule = {
  id: 'events',
  title: 'イベント',
  icon: '📅',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    ctx.registerRoute(makeRoutes(ctx.db));
    ctx.registerPanel({ title: 'イベント', icon: '📅' });
    ctx.logger.info('events ready (own data, shared with Discord bot)');
  },
};

export default eventsModule;
