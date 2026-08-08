// declarative パネルの HMR (Corpus §12.3)。
//
// Corpus が /ui-hmr から SSE で「どのサービスのどの UI キーが変わったか」を
// 流すので、 いま描いているパネルと一致したらそのパネルだけ描き直す。

import { el } from './dom.ts';

interface TrackedPanel {
  svcId: string;
  key: string;
  rerender: () => void;
}

let currentDecl: TrackedPanel | null = null;
let hmrSource: EventSource | null = null;

/** いま描いている declarative パネルを記録する。 @implements SPEC-GLAB-SHELL-004 */
export function trackDeclarativePanel(panel: TrackedPanel): void {
  currentDecl = panel;
}

/** タブ切り替え時など、 追跡対象を捨てる。 @implements SPEC-GLAB-SHELL-004 */
export function clearTrackedPanel(): void {
  currentDecl = null;
}

/** @implements SPEC-GLAB-SHELL-004 */
export function initHmr(): void {
  if (hmrSource) return;
  try {
    hmrSource = new EventSource('/ui-hmr');
    /** @implements SPEC-GLAB-SHELL-004 */
    hmrSource.addEventListener('ui-changed', (ev) => {
      try {
        const { service, key } = JSON.parse((ev as MessageEvent).data) as {
          service: string;
          key: string;
        };
        if (currentDecl && currentDecl.svcId === service && currentDecl.key === key) {
          currentDecl.rerender();
          flashHmr(`↻ ${service}/${key} を更新`);
        }
      } catch {
        /* malformed event は無視 */
      }
    });
  } catch {
    /* EventSource 不可な環境 */
  }
}

/** @implements SPEC-GLAB-SHELL-004 */
function flashHmr(msg: string): void {
  const t = el('div', 'hmr-toast', msg);
  t.style.cssText =
    'position:fixed;right:12px;bottom:12px;background:#238636;color:#fff;' +
    'padding:.4rem .7rem;border-radius:8px;font-size:.8rem;z-index:9999;opacity:.95';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}
