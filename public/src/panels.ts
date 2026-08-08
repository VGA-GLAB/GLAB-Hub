// タブに表示するパネルの読み込み。
//
//   - モジュールパネル : GLab プラグイン (`plugins/<id>/panel.js`) を動的 import
//   - サービスパネル   : 参照サービスが提供する script / declarative パネル
//
// declarative パネルの描画は Corpus 内蔵レンダラ (renderer.ts) をそのまま使う。

import type {
  Identity,
  ModuleInfo,
  PanelContext,
  PanelModule,
  ServiceInfo,
  ServicePanelContext,
  ServicePanelInfo,
  ServicePanelModule,
} from '../../corpus/public/src/types.ts';
import { renderPanel } from '../../corpus/public/src/render/renderer.ts';
import type {
  PanelDescriptor,
  RenderContext,
} from '../../corpus/public/src/render/types.ts';
import {
  readUiCache,
  writeUiCache,
} from '../../corpus/public/src/render/ui-cache.ts';
import { apiFetchForPanel, el } from './dom.ts';
import { trackDeclarativePanel } from './hmr.ts';

/** @implements SPEC-GLAB-SHELL-003 */
export async function renderModulePanel(
  container: HTMLElement,
  mod: ModuleInfo,
  identity: Identity,
): Promise<void> {
  container.innerHTML = '';
  if (!mod.panel) {
    container.appendChild(
      el('p', 'muted', 'このモジュールは表示パネルを提供していません。'),
    );
    return;
  }
  const ctx: PanelContext = {
    moduleId: mod.id,
    identity,
    api: (path, init) =>
      apiFetchForPanel(
        `/api/x/${mod.id}${path.startsWith('/') ? '' : '/'}${path}`,
        init,
      ),
    hubApi: (path, init) => apiFetchForPanel(path, init),
  };
  try {
    const url = `/plugins/${mod.id}/${mod.panel.entry}`;
    const panel = (await import(/* @vite-ignore */ url)) as PanelModule;
    if (typeof panel.mount !== 'function') {
      throw new Error('panel.js が mount() を export していません');
    }
    await panel.mount(container, ctx);
  } catch (e) {
    container.innerHTML = '';
    container.appendChild(
      el('p', 'error', `パネルの読み込みに失敗しました: ${String(e)}`),
    );
  }
}

/**
 * 参照サービス (Bb / Ae 等) が提供する hub 用パネルを表示する。
 * @implements SPEC-GLAB-SHELL-003
 */
export async function renderServicePanel(
  container: HTMLElement,
  svc: ServiceInfo,
  panel: ServicePanelInfo,
  identity: Identity,
): Promise<void> {
  container.innerHTML = '';
  if (panel.kind === 'declarative') {
    return renderDeclarativePanel(container, svc, panel, identity);
  }
  if (!panel.entry) {
    container.appendChild(el('p', 'error', 'panel に entry がありません。'));
    return;
  }
  const ctx: ServicePanelContext = {
    service: svc.id,
    identity,
    data: (dataId, init) =>
      apiFetchForPanel(
        `/api/hub/data/${svc.id}/${encodeURIComponent(dataId)}`,
        init,
      ),
  };
  try {
    const entryPath = panel.entry.startsWith('/')
      ? panel.entry
      : `/corpus-ui/${panel.entry}`;
    const mod = (await import(
      /* @vite-ignore */ `/hub-ui/${svc.id}${entryPath}`
    )) as ServicePanelModule;
    if (typeof mod.mount !== 'function') {
      throw new Error('サービスパネルが mount() を export していません');
    }
    await mod.mount(container, ctx);
  } catch (e) {
    container.innerHTML = '';
    container.appendChild(
      el('p', 'error', `サービスパネルの読み込みに失敗しました: ${String(e)}`),
    );
  }
}

/**
 * UI descriptor を取得する — WebStorage キャッシュ + ETag 条件付き取得。
 * @implements SPEC-GLAB-SHELL-004
 */
async function loadDescriptor(
  container: HTMLElement,
  svc: ServiceInfo,
  panel: ServicePanelInfo,
): Promise<PanelDescriptor | null> {
  if (panel.ui) return panel.ui;
  if (!panel.uiEndpoint) return null;

  const cached = readUiCache(svc.id, panel.id);
  try {
    const headers: Record<string, string> = {};
    if (cached) headers['if-none-match'] = cached.etag;
    // no-cache: ブラウザ HTTP cache を介さず必ずサーバへ再検証させ、 304 を JS に通す。
    const res = await apiFetchForPanel(`/hub-ui/${svc.id}${panel.uiEndpoint}`, {
      cache: 'no-cache',
      headers,
    });
    if (res.status === 304 && cached) return cached.descriptor;
    if (res.ok) {
      const descriptor = (await res.json()) as PanelDescriptor;
      const etag = res.headers.get('etag');
      if (etag) writeUiCache(svc.id, panel.id, { etag, descriptor });
      return descriptor;
    }
    if (cached) return cached.descriptor; // サーバ不調でもキャッシュで描画継続
    throw new Error(`status ${res.status}`);
  } catch (e) {
    if (cached) return cached.descriptor; // ネットワーク不通 → キャッシュ fallback
    container.appendChild(
      el('p', 'error', `UI descriptor の取得に失敗しました: ${String(e)}`),
    );
    return null;
  }
}

/** @implements SPEC-GLAB-SHELL-004 */
async function renderDeclarativePanel(
  container: HTMLElement,
  svc: ServiceInfo,
  panel: ServicePanelInfo,
  identity: Identity,
): Promise<void> {
  // HMR: このパネルを「いま描いている declarative」として記録する。
  trackDeclarativePanel({
    svcId: svc.id,
    key: panel.id,
    /** @implements SPEC-GLAB-SHELL-004 */
    rerender: () => void renderDeclarativePanel(container, svc, panel, identity),
  });

  const descriptor = await loadDescriptor(container, svc, panel);
  if (!descriptor) {
    if (!panel.ui && !panel.uiEndpoint) {
      container.appendChild(
        el('p', 'error', 'declarative panel に ui がありません。'),
      );
    }
    return;
  }

  const ctx: RenderContext = {
    identity: {
      userId: identity.userId,
      displayName: identity.displayName,
      isAdmin: identity.isAdmin,
    },
    data: (dataId, opts) => {
      const u = new URL(
        `/api/hub/data/${svc.id}/${encodeURIComponent(dataId)}`,
        location.origin,
      );
      for (const [k, v] of Object.entries(opts?.params ?? {})) {
        u.searchParams.set(`_cp_${k}`, v);
      }
      const init: RequestInit = { method: opts?.method ?? 'GET' };
      if (opts?.body !== undefined) {
        init.body = JSON.stringify(opts.body);
        init.headers = { 'content-type': 'application/json' };
      }
      return apiFetchForPanel(u.pathname + u.search, init);
    },
  };
  renderPanel(container, descriptor, ctx);
}
