// GLab のログイン画面。
//
// 入口は「パスキーで続ける」1 つ。押すと Cernere のログイン画面 (/composite/login) へ移り、
// パスキーでのログイン・はじめての方のアカウント作成は Cernere 側で行う。戻ってきた authCode を
// GLab の user token に交換する。リダイレクト URL の組み立ては Corpus submodule の実装を再利用する。

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { buildPasskeyRedirectUrl } from '../../corpus/public/src/cernere-login.tsx';
import { clearLegacyToken } from '../../corpus/public/src/api.ts';
import { BRAND_TITLE, LOGIN_SUBTITLE } from './branding.ts';
import { resolveLoginEntry, type PublicLoginConfig } from './login-config.ts';

const COMPOSITE_STATE_PARAM = 'cernere_composite_state';
const COMPOSITE_STATE_KEY = 'cernere:composite:redirect-state';

/** @implements SPEC-GLAB-SHELL-002 */
async function exchangeAuthCode(authCode: string): Promise<void> {
  const response = await fetch('/auth/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: authCode }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Cernere token exchange failed');
  }
  clearLegacyToken();
  location.reload();
}

/** @implements SPEC-GLAB-SHELL-002 */
function PasskeyLoginHost({
  cernereFrontendUrl,
  message,
}: {
  cernereFrontendUrl: string;
  message: string;
}) {
  const [error, setError] = useState('');

  useEffect(() => {
    const callbackUrl = new URL(location.href);
    const state = callbackUrl.searchParams.get(COMPOSITE_STATE_PARAM);
    const code = callbackUrl.searchParams.get('code');
    if (!state || !code) return;

    callbackUrl.searchParams.delete(COMPOSITE_STATE_PARAM);
    callbackUrl.searchParams.delete('code');
    history.replaceState({}, '', callbackUrl.toString());

    const expectedState = sessionStorage.getItem(COMPOSITE_STATE_KEY);
    sessionStorage.removeItem(COMPOSITE_STATE_KEY);
    if (!expectedState || expectedState !== state) {
      setError('ログインの復帰情報を検証できませんでした');
      return;
    }
    void exchangeAuthCode(code).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, []);

  /** @implements SPEC-GLAB-SHELL-002 */
  const startPasskeyLogin = () => {
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem(COMPOSITE_STATE_KEY, state);
      location.assign(buildPasskeyRedirectUrl(cernereFrontendUrl, location.href, state));
    } catch {
      setError('Cernere のログイン先を作成できませんでした');
    }
  };

  return (
    <>
      <h1>{BRAND_TITLE}</h1>
      <p className="muted">{message || LOGIN_SUBTITLE}</p>
      {error && <p className="error">{error}</p>}
      <button type="button" className="primary" onClick={startPasskeyLogin}>
        パスキーで続ける
      </button>
      <p className="muted">はじめての方も、このボタンから Cernere のアカウントを作れます。</p>
    </>
  );
}

/**
 * Cernere の公開設定を読み、 GLab ブランドのログイン UI を mount する。
 * @implements SPEC-GLAB-SHELL-002
 */
export function mountGlabLogin(mount: HTMLElement, message: string): () => void {
  const root = createRoot(mount);
  let disposed = false;
  root.render(<p className="muted">Cernere を読み込み中…</p>);

  void (async () => {
    try {
      const response = await fetch('/api/public-config');
      const config = (await response.json()) as PublicLoginConfig;
      if (!response.ok) {
        throw new Error('Cernere の接続先を取得できませんでした');
      }
      if (disposed) return;
      const entry = resolveLoginEntry(config);
      if (entry.kind === 'unavailable') throw new Error(entry.message);
      root.render(
        <PasskeyLoginHost
          cernereFrontendUrl={entry.cernereFrontendUrl}
          message={message}
        />,
      );
    } catch (cause) {
      if (!disposed) {
        root.render(
          <p className="error">
            {cause instanceof Error ? cause.message : String(cause)}
          </p>,
        );
      }
    }
  })();

  return () => {
    disposed = true;
    root.unmount();
  };
}
