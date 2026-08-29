// ダッシュボード — ログイン直後に開く「自分」 の面。
//
// 自分のプロフィール (Cernere vantan_user が正本) と、 既存プラグインの表から
// 畳んだ最近のアクティビティを 1 画面で見せる。 日次クエストの達成だけは本人の
// 操作として記録する。プロフィールの編集は従来どおり「プロフィール」パネル
// (vantan-user) の責務。

import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { tokyoDateKey } from '../daily-engagement/catalog.ts';
import {
  completeDailyQuest,
  getOrCreateDailyContent,
  type DailyContent,
} from '../daily-engagement/store.ts';
import { ensureGlabUser, ensureSchema } from '../data.ts';
import { noStore } from '../shared.ts';
import { getVantanUserProfile } from '../vantan-user/profile-client.ts';
import { isCompleteVantanUserProfile } from '../vantan-user/profile-schema.ts';
import { listMemberRoles, listRecentActivity, readActivityStats } from './activity.ts';

/** 一覧に出すアクティビティの件数。 画面 1 枚に収まる範囲。 */
const ACTIVITY_LIMIT = 20;
/** 出席日数を数える窓 (30 日)。 */
const STATS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const dashboardModule: CorpusModule = {
  id: 'dashboard',
  title: 'ダッシュボード',
  icon: '🏠',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const client = createCernereProjectClient(ctx);
    const router = new Hono();

    router.get('/summary', async (c) => {
      noStore(c);
      const identity = getIdentity(c);
      ensureGlabUser(ctx.db, identity.userId);
      const now = new Date();

      // Cernere が落ちていてもアクティビティは出す。 プロフィールだけ欠落させ、
      // 画面側が「取得できませんでした」 を出せるよう理由を返す。
      let profile: Record<string, string> | null = null;
      let profileComplete = false;
      let profileError: string | null = null;
      try {
        const loaded = await getVantanUserProfile(client, identity.userId);
        profile = {
          name: loaded.name,
          roleTitle: loaded.roleTitle,
          departmentName: loaded.departmentName,
        };
        profileComplete = isCompleteVantanUserProfile(loaded);
      } catch {
        profileError = 'cernere_unavailable';
        // Upstream errors can include request details. The client only needs the
        // stable availability state, and logs must not persist those details.
        ctx.logger.error('dashboard profile read failed');
      }

      return c.json({
        identity: {
          userId: identity.userId,
          displayName: identity.displayName ?? null,
        },
        profile,
        profileComplete,
        profileError,
        daily: dailyView(
          getOrCreateDailyContent(ctx.db, tokyoDateKey(now), now.getTime(), identity.userId),
        ),
        roles: listMemberRoles(ctx.db, identity.userId),
        stats: readActivityStats(ctx.db, identity.userId, now.getTime() - STATS_WINDOW_MS),
        statsWindowDays: STATS_WINDOW_MS / (24 * 60 * 60 * 1000),
        activity: listRecentActivity(ctx.db, identity.userId, ACTIVITY_LIMIT),
      });
    });

    /** @implements SPEC-GLAB-DAILY-003 */
    router.post('/daily-quest/complete', async (c) => {
      noStore(c);
      const identity = getIdentity(c);
      ensureGlabUser(ctx.db, identity.userId);
      const now = new Date();
      const dateKey = tokyoDateKey(now);
      const body = await c.req.json().catch(() => null) as { dateKey?: unknown } | null;
      if (typeof body?.dateKey !== 'string') {
        return c.json({ error: 'date_key_required' }, 400);
      }
      // 日付跨ぎ前に開いたカードで、別日のクエストを誤って達成しない。
      if (body.dateKey !== dateKey) {
        return c.json({ error: 'daily_content_stale' }, 409);
      }
      getOrCreateDailyContent(ctx.db, dateKey, now.getTime(), identity.userId);
      completeDailyQuest(ctx.db, dateKey, identity.userId, now.getTime());
      return c.json({
        daily: dailyView(
          getOrCreateDailyContent(ctx.db, dateKey, now.getTime(), identity.userId),
        ),
      });
    });

    ctx.registerRoute(router);
    ctx.registerPanel({ title: 'ダッシュボード', icon: '🏠' });
  },
};

/** Bot 配送状態は dashboard クライアントへ公開しない。 */
function dailyView(daily: DailyContent): Omit<DailyContent, 'discordNotifiedAt'> {
  return {
    dateKey: daily.dateKey,
    quest: daily.quest,
    spotlight: daily.spotlight,
    completed: daily.completed,
  };
}

export default dashboardModule;
