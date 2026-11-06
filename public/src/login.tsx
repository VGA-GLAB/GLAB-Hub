// GLab branding surrounds the current Cernere login UI hosted inside Composite.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { CompositeLoginFrame, completeServiceLogin } from '../../corpus/public/src/cernere-login.tsx';
import { clearLegacyToken } from '../../corpus/public/src/api.ts';
import { BRAND_TITLE, LOGIN_SUBTITLE } from './branding.ts';
import { resolveLoginEntry, type PublicLoginConfig } from './login-config.ts';

/** @implements SPEC-GLAB-SHELL-002 */
function EmbeddedLoginHost({
  cernereFrontendUrl,
  cernereClientId,
  signal,
  message,
}: {
  cernereFrontendUrl: string;
  cernereClientId: string;
  signal: AbortSignal;
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
        clientId={cernereClientId}
        onAuthCode={async (code, verifier) => {
          await completeServiceLogin(code, verifier, signal);
          if (!signal.aborted) location.reload();
        }}
        onError={(cause) => { if (!signal.aborted) setError(cause.message); }}
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
  const lifetime = new AbortController();
  clearLegacyToken();
  root.render(<p className="muted">Cernere を読み込み中…</p>);

  void (async () => {
    try {
      const response = await fetch('/api/public-config', { credentials: 'same-origin', redirect: 'error',
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10_000)]) });
      const config = (await response.json()) as PublicLoginConfig;
      if (!response.ok) {
        throw new Error('Cernere の接続先を取得できませんでした');
      }
      if (lifetime.signal.aborted) return;
      const entry = resolveLoginEntry(config);
      if (entry.kind === 'unavailable') throw new Error(entry.message);
      root.render(
        <EmbeddedLoginHost
          cernereFrontendUrl={entry.cernereFrontendUrl}
          cernereClientId={entry.cernereClientId}
          signal={lifetime.signal}
          message={message}
        />,
      );
    } catch (cause) {
      if (!lifetime.signal.aborted) {
        root.render(
          <p className="error">
            {cause instanceof Error ? cause.message : String(cause)}
          </p>,
        );
      }
    }
  })();

  return () => {
    lifetime.abort();
    root.unmount();
  };
}
