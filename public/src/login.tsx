// GLab branding surrounds the current Cernere login UI hosted inside Composite.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { CompositeLoginFrame } from '../../corpus/public/src/cernere-login.tsx';
import { clearLegacyToken } from '../../corpus/public/src/api.ts';
import { BRAND_TITLE, LOGIN_SUBTITLE } from './branding.ts';
import { resolveLoginEntry, type PublicLoginConfig } from './login-config.ts';

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
function EmbeddedLoginHost({
  cernereFrontendUrl,
  message,
}: {
  cernereFrontendUrl: string;
  message: string;
}) {
  const [error, setError] = useState('');

  return (
    <>
      <h1>{BRAND_TITLE}</h1>
      <p className="muted">{message || LOGIN_SUBTITLE}</p>
      {error && <p className="error">{error}</p>}
      <CompositeLoginFrame
        cernereUrl={cernereFrontendUrl}
        onAuthCode={exchangeAuthCode}
        onError={(cause) => setError(cause.message)}
      />
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
        <EmbeddedLoginHost
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
