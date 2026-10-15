// Managed Google Meet を Aedilis に中継するルート (施設・会議モジュールの一部)。
//
// - /meet/status            代表アカウントの接続状態と自分の Google 連携
// - /meet/oauth/start       Google 認可の URL (戻り先は GLab 自身、サーバが決める)
// - /meet/oauth/callback    Google の戻り。GLab のログイン cookie で本人確認して Ae へ complete
// - /meet/:id               会議の Meet リンクの取得 (GET) / 発行 (POST、会議の主催者だけ)
//
// すべて bookingProxy の署名付き中継 (x-glab-booking-context) を通す。Ae はこれを同一 Origin 検査の
// 代わりに受ける (Aedilis spec SPEC-MANAGED-MEET-GLAB-RELAY)。

import type { Context, CorpusContext, Hono, ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { PRIVATE_NO_STORE } from '../shared.ts';
import { bookingGroupsWithRepresentative, bookingProxy } from './booking-proxy.ts';
import {
  meetOAuthCompletion,
  meetOAuthRedirectUri,
  meetOAuthResultPage,
  parseMeetOAuthTarget,
  requestOrigin,
  type MeetOAuthResult,
} from './meet-oauth.ts';

const MEETING_ID = /^[0-9a-f-]{36}$/i;

function html(result: MeetOAuthResult, status = 200): Response {
  return new Response(meetOAuthResultPage(result), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': PRIVATE_NO_STORE,
      'referrer-policy': 'no-referrer',
      // 結果ページは固定文言とインラインの通知スクリプトだけ。外部読み込みは許さない。
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}

export function registerMeetRoutes(r: Hono, ctx: CorpusContext, aedilis: ServiceConnector): void {
  // 代表者の判定 (Cr 組織の owner) が要るルートだけ、組織ごとの役割も読んで署名する。
  r.get('/meet/status', c => bookingProxy(c, ctx, aedilis, '/api/meet/status', bookingGroupsWithRepresentative));
  r.post('/meet/oauth/start', async (c) => {
    const target = parseMeetOAuthTarget(await c.req.json().catch(() => null));
    if (!target) return Response.json({ error: 'invalid_mode' }, { status: 400, headers: { 'cache-control': PRIVATE_NO_STORE } });
    const redirectUri = meetOAuthRedirectUri(requestOrigin(c.req.url, c.req.header('x-forwarded-proto')));
    if (!redirectUri) return Response.json({ error: 'public_url_unconfigured' }, { status: 503, headers: { 'cache-control': PRIVATE_NO_STORE } });
    return bookingProxy(c, ctx, aedilis, '/api/meet/oauth/start', bookingGroupsWithRepresentative, {
      method: 'POST', body: JSON.stringify({ ...target, redirectUri }),
    });
  });
  r.get('/meet/oauth/callback', async (c: Context) => {
    const completion = meetOAuthCompletion({
      state: c.req.query('state'), code: c.req.query('code'), error: c.req.query('error'),
    });
    if (!completion) return html('failed', 400);
    const response = await bookingProxy(c, ctx, aedilis, '/api/meet/oauth/complete', bookingGroupsWithRepresentative, {
      method: 'POST', body: JSON.stringify(completion),
    });
    if (!response.ok) return html('failed', 400);
    const body = await response.json().catch(() => null) as { mode?: unknown } | null;
    return html(body?.mode === 'organizer' ? 'organizer' : 'creator');
  });
  for (const method of ['get', 'post'] as const) {
    r[method]('/meet/:id', (c: Context) => {
      const id = c.req.param('id') ?? '';
      if (!MEETING_ID.test(id)) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'cache-control': PRIVATE_NO_STORE } });
      return method === 'get'
        ? bookingProxy(c, ctx, aedilis, `/api/meet/${id}`)
        : bookingProxy(c, ctx, aedilis, `/api/meet/${id}`, undefined, { method: 'POST', body: '{}' });
    });
  }
}
