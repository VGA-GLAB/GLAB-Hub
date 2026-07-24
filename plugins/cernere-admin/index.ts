import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import {
  createCernereAdminEntryPoints,
  normalizeCernereWebUrl,
} from './entry-points.ts';

/**
 * Cernere のデータ管理 / 設定への動線。
 *
 * 認証データの実体は Cernere が単一情報源 (GLAB 側には複製しない) なので、
 * このモジュールは Cernere Web UI (cernere-frontend) の該当画面を新しいタブで
 * 開くリンクだけを提供する。health コネクタは vantan-user が既に
 * `cernere` として登録しているため、ここでは登録しない。
 */
const cernereAdminModule: CorpusModule = {
  id: 'cernere-admin',
  title: 'Cernere 設定',
  icon: '⚙️',
  setup(ctx: CorpusContext) {
    const webBaseUrl = normalizeCernereWebUrl(ctx.env('CERNERE_WEB_URL'), 'CERNERE_WEB_URL');
    const entryPoints = webBaseUrl ? createCernereAdminEntryPoints(webBaseUrl) : null;

    const routes = new Hono();
    routes.get('/entry-points', (c) => {
      if (!entryPoints) return c.json({ error: 'cernere_web_unconfigured' }, 503);
      return c.json(entryPoints);
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'Cernere 設定', icon: '⚙️' });
    ctx.logger.info(`account/data management → Cernere (${webBaseUrl ?? '未設定 = degraded'})`);
  },
};

export default cernereAdminModule;
