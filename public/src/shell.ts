// GLab のシェル — ヘッダ (ブランド / ログアウト) とタブ。
//
// タブは「GLab プラグイン + 参照サービスのパネル + ステータス」。
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
import { themeControl } from './theme.ts';
import { setupNavigation } from './navigation.ts';
import { mountHeaderStatus } from './header-status.ts';

/** ログイン直後に開くタブ (dashboard プラグインのモジュール id)。 */
const LANDING_TAB_ID = 'dashboard';

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
  // ダッシュボードはログイン直後に開く面なので、 読み込み順に関わらず先頭へ出す。
  const ordered = [
    ...modules.filter((m) => m.id === LANDING_TAB_ID),
    ...modules.filter((m) => m.id !== LANDING_TAB_ID),
  ];
  return [
    ...ordered.map((m) => ({
      id: m.id,
      label: m.title,
      render: () => void renderModulePanel(main, m, identity),
    })),
    { id: '__overview', label: 'サービス状況', render: () => void renderOverview(main) },
    ...services.flatMap((svc) =>
      (svc.manifest?.panels ?? []).map((panel) => ({
        id: `svc:${svc.id}:${panel.id}`,
        label: panel.title,
        render: () => void renderServicePanel(main, svc, panel, identity),
      })),
    ),
  ];
}

/** @implements SPEC-GLAB-SHELL-002 */
function buildHeader(identity: Identity, onLogout: () => void, toggle: HTMLButtonElement, status: HTMLElement): HTMLElement {
  const header = el('header', 'topbar');
  header.appendChild(toggle);
  header.appendChild(el('span', 'brand', BRAND_TITLE));
  header.appendChild(status);
  const account = el('div', 'header-account');
  account.appendChild(el('span', 'who', identity.displayName ?? identity.userId));
  account.appendChild(themeControl());
  const logout = el('button', 'ghost', 'ログアウト');
  /** @implements SPEC-GLAB-SHELL-002 */
  logout.onclick = () => {
    void fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(() => {
        clearLegacyToken();
        onLogout();
      });
  };
  account.appendChild(logout);
  header.appendChild(account);
  return header;
}

/** @implements SPEC-GLAB-SHELL-003 */
export function renderShell(
  app: HTMLElement,
  identity: Identity,
  modules: ModuleInfo[],
  services: ServiceInfo[],
  onLogout: () => void,
): () => void {
  app.innerHTML = '';
  const toggle = el('button', 'menu-toggle', '☰');
  toggle.setAttribute('aria-label', 'メニュー');
  const status = el('div', 'header-status');
  app.appendChild(buildHeader(identity, onLogout, toggle, status));

  const layout = el('div', 'layout');
  const nav = el('nav', 'tabs');
  const main = el('main', 'panel');
  layout.appendChild(nav);
  layout.appendChild(main);
  app.appendChild(layout);
  nav.appendChild(el('div', 'nav-caption', 'WORKSPACE'));
  const navigation = setupNavigation(layout, nav, main, toggle);
  const disposeStatus = mountHeaderStatus(status);

  const tabs = buildTabs(main, identity, modules, services);
  const buttons = new Map<string, HTMLButtonElement>();
  /** @implements SPEC-GLAB-SHELL-003 */
  function activate(id: string): void {
    for (const [tid, btn] of buttons) {
      btn.classList.toggle('active', tid === id);
      if (tid === id) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    navigation.close();
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
  // ダッシュボードが読み込まれていればそこから始める。 プラグインが無効な
  // 構成でも画面が空にならないよう、 従来のステータスへ落とす。
  activate(tabs.some((t) => t.id === LANDING_TAB_ID) ? LANDING_TAB_ID : '__overview');
  initHmr();
  return () => { navigation.dispose(); disposeStatus(); };
}
