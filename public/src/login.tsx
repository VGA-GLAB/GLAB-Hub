// GLab のログイン画面。
//
// 認証そのものは Cernere composite (Corpus 経由) をそのまま使い、 GLab は
// 表示ラベルだけを持つ。 認証ロジック側 (CernereCompositeAuthClient /
// buildPasskeyRedirectUrl) は Corpus submodule の実装を再利用する。

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { CompositeLogin } from '../../corpus/lib/cernere/packages/composite/src/ui/index.ts';
import {
  buildPasskeyRedirectUrl,
  CernereCompositeAuthClient,
} from '../../corpus/public/src/cernere-login.tsx';
import { clearLegacyToken } from '../../corpus/public/src/api.ts';
import { BRAND_TITLE, LOGIN_SUBTITLE } from './branding.ts';

interface PublicConfig {
  cernereFrontendUrl?: string;
  authUiMode?: 'composite' | 'passkey';
}

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
function CompositeLoginHost({
  client,
  message,
}: {
  client: CernereCompositeAuthClient;
  message: string;
}) {
  const [error, setError] = useState('');
  return (
    <>
      {error && <p className="error">{error}</p>}
      <CompositeLogin
        authApi={client}
        onAuthCode={(code) => {
          setError('');
          void exchangeAuthCode(code).catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
        labels={{
          title: BRAND_TITLE,
          subtitle: message || LOGIN_SUBTITLE,
          loginTab: 'ログイン',
          registerTab: '新規登録',
          name: '名前',
          email: 'メールアドレス',
          password: 'パスワード',
          submitLogin: 'ログイン',
          submitRegister: 'アカウントを作成',
          processing: '処理中…',
          deviceTitle: '本人確認',
          deviceCode: '確認コード',
          deviceSubmit: '確認する',
          deviceResend: 'コードを再送',
        }}
      />
    </>
  );
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
        ログイン
      </button>
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
  let client: CernereCompositeAuthClient | null = null;
  root.render(<p className="muted">Cernere を読み込み中…</p>);

  void (async () => {
    try {
      const response = await fetch('/api/public-config');
      const config = (await response.json()) as PublicConfig;
      if (!response.ok) {
        throw new Error('Cernere の接続先を取得できませんでした');
      }
      if (disposed) return;
      if (config.authUiMode === 'passkey') {
        if (!config.cernereFrontendUrl) {
          throw new Error('Cernere ログイン画面の接続先を取得できませんでした');
        }
        root.render(
          <PasskeyLoginHost
            cernereFrontendUrl={config.cernereFrontendUrl}
            message={message}
          />,
        );
        return;
      }
      client = new CernereCompositeAuthClient();
      root.render(<CompositeLoginHost client={client} message={message} />);
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
    client?.dispose();
    root.unmount();
  };
}
