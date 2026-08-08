// GLab のシェル — ヘッダ (ブランド / ログアウト) とタブ。
//
// タブは「ステータス + GLab プラグイン + 参照サービスのパネル」。
// ドメイン UI は一切持たない (中身は plugins/<id>/panel.ts 側)。

import { clearLegacyToken } from '../../corpus/public/src/api.ts';
import type {
  Identity,
  ModuleInfo,
  ServiceInfo,
} from '../../corpus/public/src/types.ts';
import { BRAND_TITLE } from './branding.ts';
import { el } from './dom.ts';
import { clearTrackedPanel, initHmr } from './hmr.ts';
import { renderOverview } from './overview.ts';
import { renderModulePanel, renderServicePanel } from './panels.ts';

interface Tab {
  id: string;
  label: string;
  render: () => void;
}

/** @implements SPEC-GLAB-SHELL-003 */
function buildTabs(
  main: HTMLElement,
  identity: Identity,
  modules: ModuleInfo[],
  services: ServiceInfo[],
): Tab[] {
  return [
    { id: '__overview', label: '🟢 ステータス', render: () => void renderOverview(main) },
    ...modules.map((m) => ({
      id: m.id,
      label: `${m.icon ?? '▫'} ${m.title}`,
      render: () => void renderModulePanel(main, m, identity),
    })),
    ...services.flatMap((svc) =>
      (svc.manifest?.panels ?? []).map((panel) => ({
        id: `svc:${svc.id}:${panel.id}`,
        label: `${panel.icon ?? '🧩'} ${panel.title}`,
        render: () => void renderServicePanel(main, svc, panel, identity),
      })),
    ),
  ];
}

/** @implements SPEC-GLAB-SHELL-002 */
function buildHeader(identity: Identity, onLogout: () => void): HTMLElement {
  const header = el('header', 'topbar');
  header.appendChild(el('span', 'brand', BRAND_TITLE));
  header.appendChild(el('span', 'who', identity.displayName ?? identity.userId));
  const logout = el('button', 'ghost', 'ログアウト');
  /** @implements SPEC-GLAB-SHELL-002 */
  logout.onclick = () => {
    void fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(() => {
        clearLegacyToken();
        onLogout();
      });
  };
  header.appendChild(logout);
  return header;
}

/** @implements SPEC-GLAB-SHELL-003 */
export function renderShell(
  app: HTMLElement,
  identity: Identity,
  modules: ModuleInfo[],
  services: ServiceInfo[],
  onLogout: () => void,
): void {
  app.innerHTML = '';
  app.appendChild(buildHeader(identity, onLogout));

  const layout = el('div', 'layout');
  const nav = el('nav', 'tabs');
  const main = el('main', 'panel');
  layout.appendChild(nav);
  layout.appendChild(main);
  app.appendChild(layout);

  const tabs = buildTabs(main, identity, modules, services);
  const buttons = new Map<string, HTMLButtonElement>();
  /** @implements SPEC-GLAB-SHELL-003 */
  function activate(id: string): void {
    for (const [tid, btn] of buttons) btn.classList.toggle('active', tid === id);
    // HMR 追跡をリセット — declarative パネルが描かれたら自身で再設定する。
    clearTrackedPanel();
    tabs.find((t) => t.id === id)?.render();
  }
  for (const tab of tabs) {
    const btn = el('button', 'tab', tab.label);
    /** @implements SPEC-GLAB-SHELL-003 */
    btn.onclick = () => activate(tab.id);
    buttons.set(tab.id, btn);
    nav.appendChild(btn);
  }
  activate('__overview');
  initHmr();
}
