// GLAB モジュール: 部員名簿 (管理者のみ)。
//
// PII の正本は Cernere vantan_user。 GLAB が氏名 (display_name) を持つのは
// 「Cernere 未登録の部員」の間だけで、 user_id をリンクした時点で破棄する。
// Discord は名前 (handle) で入力し、 数値 ID は bot が解決する (bot/member-resolver.ts)。
// 全 API が requireAdmin — 一般部員には一覧を返さない (ユーザー非公開)。

import { Hono, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { CernereProjectClient } from '../vantan-user/cernere-client.ts';
import {
  MEMBER_STATUSES,
  createMember,
  deleteMember,
  ensureSchema,
  linkMemberToUser,
  listGlabUsers,
  listMembers,
  updateMember,
  type MemberRow,
} from '../data.ts';

const newMemberSchema = z.object({
  displayName: z.string().trim().min(1, '氏名は必須です').max(200),
  discordHandle: z.string().trim().max(200).optional(),
  clubRole: z.string().trim().max(200).optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
}).strict();

const patchMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  discordHandle: z.string().trim().max(200).nullable().optional(),
  clubRole: z.string().trim().max(200).nullable().optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
}).strict();

const linkSchema = z.object({
  userId: z.string().trim().min(1),
}).strict();

interface MemberView {
  id: string;
  userId: string | null;
  registered: boolean;
  /** 登録済みは Cernere vantan_user の氏名、 未登録は GLAB 保持の氏名。 */
  name: string;
  discordHandle: string | null;
  discordUserId: string | null;
  status: string;
  clubRole: string | null;
  joinedAt: number;
  updatedAt: number;
}

function makeModule(): CorpusModule {
  return {
    id: 'members',
    title: '部員名簿',
    icon: '📋',
    setup(ctx: CorpusContext) {
      ensureSchema(ctx.db);

      // Cernere 氏名解決 (登録済み部員の表示用)。 credential 未設定の単独 dev では
      // 名前解決なしで degrade する (名簿機能自体は使える)。
      const clientId = ctx.env('CERNERE_PROJECT_CLIENT_ID')?.trim();
      const clientSecret = ctx.env('CERNERE_PROJECT_CLIENT_SECRET')?.trim();
      const cernereBaseUrl = ctx.env('CERNERE_BASE_URL')?.trim();
      const cernere = clientId && clientSecret && cernereBaseUrl
        ? new CernereProjectClient({ cernereBaseUrl, clientId, clientSecret })
        : null;
      if (!cernere) {
        ctx.logger.warn('members: Cernere project credential 未設定 — 登録済み部員の氏名解決は無効');
      }

      async function resolveName(row: MemberRow): Promise<string> {
        if (!row.user_id) return row.display_name ?? '(無名)';
        if (!cernere) return '(Cernere 未接続)';
        try {
          const profile = await cernere.getVantanUserProfile(row.user_id);
          return profile.name || '(未登録プロフィール)';
        } catch {
          return '(取得失敗)';
        }
      }

      async function view(row: MemberRow): Promise<MemberView> {
        return {
          id: row.id,
          userId: row.user_id,
          registered: row.user_id !== null,
          name: await resolveName(row),
          discordHandle: row.discord_handle,
          discordUserId: row.discord_user_id,
          status: row.status,
          clubRole: row.club_role,
          joinedAt: row.joined_at,
          updatedAt: row.updated_at,
        };
      }

      const router = new Hono();

      router.get('/list', requireAdmin, async (c) => {
        const members = await Promise.all(listMembers(ctx.db).map(view));
        return c.json({ members });
      });

      router.post('/', requireAdmin, async (c) => {
        const parsed = newMemberSchema.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) {
          return c.json({ error: 'invalid_member', fields: parsed.error.flatten().fieldErrors }, 400);
        }
        const actor = getIdentity(c);
        const row = createMember(ctx.db, {
          displayName: parsed.data.displayName,
          discordHandle: parsed.data.discordHandle || null,
          clubRole: parsed.data.clubRole || null,
          status: parsed.data.status,
        }, actor.userId);
        return c.json({ ok: true, member: await view(row) }, 201);
      });

      router.patch('/:id', requireAdmin, async (c) => {
        const parsed = patchMemberSchema.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) {
          return c.json({ error: 'invalid_member', fields: parsed.error.flatten().fieldErrors }, 400);
        }
        const actor = getIdentity(c);
        const row = updateMember(ctx.db, c.req.param('id'), parsed.data, actor.userId);
        if (!row) return c.json({ error: 'not_found' }, 404);
        return c.json({ ok: true, member: await view(row) });
      });

      // 名簿行を Cernere ユーザにリンク (以後の氏名は Cernere 正本、 GLAB 側 PII は破棄)
      router.post('/:id/link', requireAdmin, async (c) => {
        const parsed = linkSchema.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json({ error: 'invalid_link' }, 400);
        const actor = getIdentity(c);
        const row = linkMemberToUser(ctx.db, c.req.param('id'), parsed.data.userId, actor.userId);
        if (!row) return c.json({ error: 'not_found_or_already_linked' }, 409);
        return c.json({ ok: true, member: await view(row) });
      });

      router.delete('/:id', requireAdmin, (c) => {
        if (!deleteMember(ctx.db, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);
        return c.json({ ok: true });
      });

      // リンク候補 = GLab にログイン済みの Cernere ユーザ (glab_user) のうち未リンクのもの。
      router.get('/link-candidates', requireAdmin, async (c) => {
        const linked = new Set(listMembers(ctx.db).map((m) => m.user_id).filter(Boolean));
        const candidates = listGlabUsers(ctx.db).filter((u) => !linked.has(u.user_id));
        const withNames = await Promise.all(candidates.map(async (u) => ({
          userId: u.user_id,
          name: cernere
            ? await cernere.getVantanUserProfile(u.user_id).then((p) => p.name || '(未登録プロフィール)').catch(() => '(取得失敗)')
            : '(Cernere 未接続)',
        })));
        return c.json({ candidates: withNames });
      });

      ctx.registerRoute(router);
      ctx.registerPanel({ title: '部員名簿', icon: '📋' });
      ctx.logger.info('members ready (admin-only roster, PII source of truth = Cernere)');
    },
  };
}

export default makeModule();
