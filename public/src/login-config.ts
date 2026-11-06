// Authentication stays inside the hosted Composite frame on the GLab page.
// Cernere owns the passkey origin and current login UI.

export interface PublicLoginConfig {
  cernereFrontendUrl?: string;
  cernereClientId?: string;
}

export type LoginEntry =
  | { kind: 'passkey'; cernereFrontendUrl: string; cernereClientId: string }
  | { kind: 'unavailable'; message: string };

/** @implements SPEC-GLAB-SHELL-002 */
export function resolveLoginEntry(config: PublicLoginConfig): LoginEntry {
  const url = config.cernereFrontendUrl?.trim();
  const clientId = config.cernereClientId?.trim();
  if (!url || !clientId) {
    return {
      kind: 'unavailable',
      message: 'Cernere の接続先とサービス登録を取得できませんでした。',
    };
  }
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/'
      || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error('Invalid frontend origin');
  } catch {
    return { kind: 'unavailable', message: 'Cernere ログイン画面の接続先が URL ではありません' };
  }
  return { kind: 'passkey', cernereFrontendUrl: url, cernereClientId: clientId };
}
