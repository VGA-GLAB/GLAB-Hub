// Authentication stays inside the hosted Composite frame on the GLab page.
// Cernere owns the passkey origin and current login UI.

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
