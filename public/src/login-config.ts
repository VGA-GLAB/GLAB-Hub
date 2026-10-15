// GLab のログイン入口の決定。
//
// Cernere のログインはパスキーのみ (2026-10-14)。パスキーの RP ID は Cernere の origin なので、
// 認証は必ず Cernere のログイン画面 (/composite/login) で行い、GLab は「パスキーで続ける」
// 1 つの入口からそこへ移るだけにする (neco 2026-10-15「Composite もパスキー一本化」)。
// 旧 composite (GLab 画面内の email / password) は Cernere 側で 410 になっているので出さない。

export interface PublicLoginConfig {
  cernereFrontendUrl?: string;
  authUiMode?: string;
}

export type LoginEntry =
  | { kind: 'passkey'; cernereFrontendUrl: string }
  | { kind: 'unavailable'; message: string };

/** @implements SPEC-GLAB-SHELL-002 */
export function resolveLoginEntry(config: PublicLoginConfig): LoginEntry {
  const url = config.cernereFrontendUrl?.trim();
  if (!url) {
    return {
      kind: 'unavailable',
      message: 'Cernere ログイン画面の接続先を取得できませんでした (CORPUS_AUTH_UI_MODE=passkey と CERNERE_FRONTEND_URL を確認してください)',
    };
  }
  try {
    new URL(url);
  } catch {
    return { kind: 'unavailable', message: 'Cernere ログイン画面の接続先が URL ではありません' };
  }
  return { kind: 'passkey', cernereFrontendUrl: url };
}
