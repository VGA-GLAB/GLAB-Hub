// 外部サービス (Calliope 等) 向け read API の認可。
//
// Corpus の requireAuth (Cernere user token 検証) は `/api/*` 全体に既に適用済みで、
// 個々のブラウザユーザの本人性を保証する。 一方 Calliope はログイン中ユーザを介さず
// バックグラウンドから読みに来るサービスなので、 「どのサービスが呼んでいるか」 を
// 区別する追加ゲートとして固定の service token を照合する (facility 等の
// HttpServiceConnector と対になる「受信側」の認可)。
//
// spec/interface/projects-registry.md に契約を記録。 corpus/ の requireAuth は
// 変更できない (submodule 改変禁止) ため、 この service token チェックは
// requireAuth の内側 (プラグインルート到達後) で追加の層として働く。

import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from '../../corpus/server/hub/sdk.ts';

/**
 * 設定不備 (env 未設定) は §7.1 (無言フォールバック禁止) に従い、 最も緩い経路
 * (誰でも通す) に落とさず 503 で明示的に拒否する
 * (facility の AEDILIS_BASE_URL 未設定 → 503 「未接続」と同じ扱い)。
 */
export function requireServiceToken(expected: string | undefined): MiddlewareHandler {
  const trimmed = expected?.trim();
  return async (c: Context, next) => {
    if (!trimmed) {
      return c.json({ error: 'service_token_unconfigured' }, 503);
    }
    const provided = extractServiceToken(c);
    if (!provided || !safeEqual(provided, trimmed)) {
      return c.json({ error: 'invalid_service_token' }, 401);
    }
    await next();
  };
}

function extractServiceToken(c: Context): string | null {
  const header = c.req.header('x-glab-service-token');
  if (header && header.trim()) return header.trim();
  const auth = c.req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

/** 生トークンを可変時間比較しないための timing-safe 比較。 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
