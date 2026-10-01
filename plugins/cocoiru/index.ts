// Cocoiru (デスクトップ常駐アプリ) のバックエンド。
//
// Cocoiru の常駐プラグインは GLAB URL から `<GLAB>/api/x/cocoiru` と groupId "glab" を導出して
// ここへ話す。 API 契約は spec/feature/cocoiru-backend.md が正本で、 Cocoiru 側が既に話している
// 形なので変えない。 Web 画面 (panel) は持たない。 個人情報は保存しない。

import { randomBytes, randomUUID } from 'node:crypto';
import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { noStore } from '../shared.ts';
import { BodyTooLargeError, readBodyWithinLimit } from '../vantan-user/bounded-body.ts';
import {
  acknowledgeCall,
  broadcastTasukete,
  countPendingCalls,
  getOrCreateLobbySecret,
  hasActiveLease,
  hasRecentCall,
  hasRecentTasukete,
  insertCall,
  listAvailableUserIds,
  listInbox,
  purgeExpired,
  upsertAvailability,
  type CocoiruCallRow,
} from './store.ts';

/** 受け付ける groupId はこれだけ。 それ以外は 404。 */
const GROUP_ID = 'glab';
const MAX_BODY_BYTES = 8 * 1024;
const LEASE_SECONDS = 30;
const CALL_TTL_MS = 5 * 60_000;
const CALL_REPEAT_WINDOW_MS = 10_000;
const INBOX_LIMIT = 20;
const AVAILABLE_LIMIT = 100;
const TASUKETE_WINDOW_MS = 60_000;
const TASUKETE_TITLE = 'タスケテ';

const availabilitySchema = z.object({ available: z.boolean() }).strict();
const callSchema = z.object({
  recipientId: z.string().min(1).max(128),
  title: z.string().min(1).max(120),
  body: z.string().max(1000),
}).strict();
const tasuketeSchema = z.object({ text: z.string().max(500) }).strict();

type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

/** 8 KiB を超える本文はメモリへ取り込まずに 413、JSON でなければ 400。 */
async function readJson(raw: Request): Promise<BodyResult> {
  try {
    const buffer = await readBodyWithinLimit(raw, MAX_BODY_BYTES);
    return { ok: true, value: JSON.parse(new TextDecoder().decode(buffer)) };
  } catch (error) {
    return { ok: false, status: error instanceof BodyTooLargeError ? 413 : 400 };
  }
}

function inboxView(row: CocoiruCallRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    expiresAt: new Date(row.expires_at).toISOString(),
    kind: row.kind,
    senderId: row.sender_id,
    createdAt: row.created_at,
  };
}

const cocoiruModule: CorpusModule = {
  id: 'cocoiru', title: 'Cocoiru', icon: '🏠',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const r = new Hono();
    r.use('/resident/:groupId/*', async (c, next) => {
      if (c.req.param('groupId') !== GROUP_ID) return c.json({ error: 'unknown_group' }, 404);
      noStore(c);
      await next();
    });

    r.put('/resident/:groupId/availability', async (c) => {
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: 'invalid_availability' }, body.status);
      const parsed = availabilitySchema.safeParse(body.value);
      if (!parsed.success) return c.json({ error: 'invalid_availability' }, 400);
      const now = Date.now();
      purgeExpired(ctx.db, now);
      upsertAvailability(ctx.db, getIdentity(c).userId, parsed.data.available, now + LEASE_SECONDS * 1000);
      return c.json({ ok: true, leaseSeconds: LEASE_SECONDS });
    });

    r.get('/resident/:groupId/available', (c) => {
      const userIds = listAvailableUserIds(ctx.db, Date.now(), AVAILABLE_LIMIT);
      return c.json(userIds.map((userId) => ({ userId })));
    });

    r.post('/resident/:groupId/calls', async (c) => {
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: 'invalid_call' }, body.status);
      const parsed = callSchema.safeParse(body.value);
      if (!parsed.success) return c.json({ error: 'invalid_call' }, 400);
      const senderId = getIdentity(c).userId;
      const now = Date.now();
      const { recipientId } = parsed.data;
      if (!hasActiveLease(ctx.db, recipientId, now)) return c.json({ error: 'recipient_unavailable' }, 409);
      if (countPendingCalls(ctx.db, recipientId, now) >= INBOX_LIMIT
        || hasRecentCall(ctx.db, senderId, recipientId, now - CALL_REPEAT_WINDOW_MS)) {
        return c.json({ error: 'rate_limited' }, 429);
      }
      const id = randomUUID();
      insertCall(ctx.db, {
        id, senderId, recipientId, title: parsed.data.title, body: parsed.data.body,
        createdAt: now, expiresAt: now + CALL_TTL_MS,
      });
      return c.json({ id }, 201);
    });

    r.get('/resident/:groupId/inbox', (c) => {
      const rows = listInbox(ctx.db, getIdentity(c).userId, Date.now(), INBOX_LIMIT);
      return c.json(rows.map(inboxView));
    });

    r.delete('/resident/:groupId/inbox/:id', (c) => {
      acknowledgeCall(ctx.db, getIdentity(c).userId, c.req.param('id'));
      return c.json({ ok: true });
    });

    r.post('/resident/:groupId/tasukete', async (c) => {
      const body = await readJson(c.req.raw);
      if (!body.ok) return c.json({ error: 'invalid_tasukete' }, body.status);
      const parsed = tasuketeSchema.safeParse(body.value);
      const text = parsed.success ? parsed.data.text.trim() : '';
      if (!text) return c.json({ error: 'invalid_tasukete' }, 400);
      const senderId = getIdentity(c).userId;
      const now = Date.now();
      if (hasRecentTasukete(ctx.db, senderId, now - TASUKETE_WINDOW_MS)) return c.json({ error: 'rate_limited' }, 429);
      const sent = broadcastTasukete(ctx.db, {
        senderId, title: TASUKETE_TITLE, body: text, createdAt: now, expiresAt: now + CALL_TTL_MS,
      });
      if (sent === 0) return c.json({ error: 'no_available_members' }, 409);
      return c.json({ sent }, 201);
    });

    r.get('/resident/:groupId/discord-lobby', (c) => {
      c.header('Cache-Control', 'private, no-store');
      const secret = getOrCreateLobbySecret(ctx.db, randomBytes(32).toString('hex'), Date.now());
      return c.json({ secret });
    });

    ctx.registerRoute(r);
  },
};

export default cocoiruModule;
