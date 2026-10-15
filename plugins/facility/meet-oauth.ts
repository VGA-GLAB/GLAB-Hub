// Managed Meet の Google 認可を GLab の画面で受けるための純関数 (I/O なし)。
//
// Aedilis の Meet 代表アカウント (organizer) と作成者 (creator) の Google 認可は、GLab にログインした
// まま行う (neco 2026-10-14「Meet の代表者になるアカウントは GLab でログインする」)。Google の戻り先は
// GLab 自身の callback ルートで、GLab のログイン cookie (SameSite=Lax、トップレベル GET で届く) が
// 本人確認になる。code と state は Ae の oauth/complete へ同じ Cr ユーザの署名付き中継で渡す。

export const MEET_OAUTH_CALLBACK_PATH = '/api/x/facility/meet/oauth/callback';
export type MeetOAuthMode = 'creator' | 'organizer';

/** Ae の AEDILIS_MEET_EXTERNAL_REDIRECT_URIS と完全一致させる戻り先。公開 URL が無ければ null。 */
export function meetOAuthRedirectUri(publicUrl: string | undefined): string | null {
  if (!publicUrl?.trim()) return null;
  try {
    const base = new URL(publicUrl.trim());
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
    return new URL(MEET_OAUTH_CALLBACK_PATH, base).href;
  } catch {
    return null;
  }
}

export function parseMeetOAuthMode(value: unknown): MeetOAuthMode | null {
  if (!value || typeof value !== 'object') return null;
  const mode = (value as Record<string, unknown>).mode;
  return mode === 'creator' || mode === 'organizer' ? mode : null;
}

export interface MeetOAuthCallbackQuery {
  state: string | undefined;
  code: string | undefined;
  error: string | undefined;
}

/** Google の戻りの query を Ae に渡せる形にする。キャンセル・欠落は null。 */
export function meetOAuthCompletion(query: MeetOAuthCallbackQuery): { state: string; code: string } | null {
  if (query.error) return null;
  const state = query.state ?? '';
  const code = query.code ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) return null;
  return { state, code };
}

const RESULT_MESSAGES = {
  organizer: 'Meet の代表アカウントを Google で認可しました。',
  creator: 'Google アカウントを連携しました。',
  failed: 'Google 認可を完了できませんでした。GLab の「施設・会議」からやり直してください。',
} as const;

export type MeetOAuthResult = keyof typeof RESULT_MESSAGES;

/**
 * popup に返す結果ページ。opener (GLab の画面) へ同一 Origin 限定で結果だけを知らせて閉じる。
 * code・state・トークンは載せない。文言は固定値だけを埋め込む (利用者入力を HTML に入れない)。
 */
export function meetOAuthResultPage(result: MeetOAuthResult): string {
  const message = RESULT_MESSAGES[result];
  const payload = JSON.stringify({ type: 'glab-meet-oauth', result });
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google 認可 - GLab</title></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem;">
<p>${message}</p><p>このウインドウは閉じてかまいません。</p>
<script>
try { if (window.opener) window.opener.postMessage(${payload}, window.location.origin); } catch (e) {}
setTimeout(function () { window.close(); }, 1200);
</script>
</body></html>`;
}
