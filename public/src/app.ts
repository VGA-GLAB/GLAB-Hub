// GLab frontend の入口。
//
// GLab は Corpus (submodule) の汎用 hub を土台にしつつ、 画面そのもの
// (index.html / シェル / ブランド) は GLab 側で持つ。 認証・パネル描画・
// declarative renderer といった汎用機構は Corpus の実装を import して使う。
//
//   - Cernere composite でログイン (`login.tsx`)
//   - /api/me → /api/hub/modules → /api/hub/services でシェルを構成 (`shell.ts`)

import { apiJson, AuthError, clearLegacyToken } from '../../corpus/public/src/api.ts';
import type {
  Identity,
  ModuleInfo,
  ServiceInfo,
} from '../../corpus/public/src/types.ts';
import { el } from './dom.ts';
import { mountGlabLogin } from './login.tsx';
import { renderShell } from './shell.ts';

const app = document.getElementById('app') as HTMLElement;

let unmountLogin: (() => void) | null = null;

/** @implements SPEC-GLAB-SHELL-002 */
function showLogin(message: string): void {
  unmountLogin?.();
  unmountLogin = null;
  app.innerHTML = '';
  const box = el('div', 'login');
  const mount = el('div', 'login-ui');
  box.appendChild(mount);
  app.appendChild(box);
  unmountLogin = mountGlabLogin(mount, message);
}

/** @implements SPEC-GLAB-SHELL-003 */
async function boot(): Promise<void> {
  clearLegacyToken();
  try {
    const identity = await apiJson<Identity>('/api/me');
    const { modules } = await apiJson<{ modules: ModuleInfo[] }>('/api/hub/modules');
    const { services } = await apiJson<{ services: ServiceInfo[] }>(
      '/api/hub/services',
    );
    renderShell(app, identity, modules, services, () =>
      showLogin('ログアウトしました。'),
    );
  } catch (e) {
    if (e instanceof AuthError) {
      showLogin('セッションが切れました。 再度ログインしてください。');
    } else {
      app.innerHTML = '';
      app.appendChild(el('p', 'error', `起動に失敗しました: ${String(e)}`));
    }
  }
}

void boot();
