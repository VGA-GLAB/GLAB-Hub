// プラグインパネル共有 frontend ヘルパ。
//
// 各モジュールの panel.ts はこれを import する。 esbuild が panel ごとに
// 個別バンドルするので、 このファイルは各 panel.js に inline される。

export type { PanelContext, PanelModule } from '../corpus/public/src/types.ts';

/** 要素生成。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** epoch ms を短い相対/時刻表記にする。 */
export function fmtTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** epoch ms を日時の絶対表記にする (イベント / 締切表示用)。 */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** セクション見出し + ボディの簡易カード。 */
export function section(title: string): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = el('section', 'gl-section');
  wrap.appendChild(el('h3', 'gl-section-title', title));
  const body = el('div', 'gl-section-body');
  wrap.appendChild(body);
  return { wrap, body };
}

/**
 * コネクタ系モジュール用。 接続先未稼働 (503) / エラーを判定して
 * 「未接続」 通知メッセージ要素を返す。 正常時は null。
 */
export async function connectorGuard(
  res: Response,
  serviceName: string,
): Promise<HTMLElement | null> {
  if (res.ok) return null;
  if (res.status === 503) {
    const box = el('div', 'gl-notice');
    box.appendChild(el('strong', undefined, `${serviceName} に未接続`));
    box.appendChild(
      el('p', 'gl-muted', `${serviceName} が稼働して接続設定が入ると、 ここに表示されます。`),
    );
    return box;
  }
  const box = el('div', 'gl-notice gl-notice-error');
  box.appendChild(el('strong', undefined, `${serviceName} の取得に失敗 (${res.status})`));
  return box;
}

/** パネル共通スタイルを 1 度だけ注入する。 */
let stylesInjected = false;
export function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    .gl-section { margin: 0 0 1.4rem; }
    .gl-section-title { margin: 0 0 0.5rem; font-size: 0.95rem; }
    .gl-muted { color: #8b90a0; }
    .gl-row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .gl-list { list-style: none; margin: 0; padding: 0; }
    .gl-list li { padding: 0.5rem 0; border-bottom: 1px solid #252934; }
    .gl-input, .gl-textarea, .gl-select {
      font: inherit; background: #1c1f29; color: #e7e9ee;
      border: 1px solid #2f3442; border-radius: 8px; padding: 0.5rem 0.7rem;
    }
    .gl-textarea { width: 100%; min-height: 4rem; resize: vertical; }
    .gl-btn {
      font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid transparent;
      padding: 0.5rem 0.9rem; background: #5b8cff; color: #fff;
    }
    .gl-btn.ghost { background: transparent; color: #8b90a0; border-color: #2f3442; }
    .gl-btn:hover { filter: brightness(1.1); }
    .gl-notice { background: #1c1f29; border: 1px solid #2f3442; border-radius: 10px; padding: 1rem 1.2rem; }
    .gl-notice-error { border-color: #d9534f; }
    .gl-tag { font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #2f3442; }
    .gl-tag.open { background: #d9a93a; color: #14161c; }
    .gl-tag.closed { background: #3fb95a; color: #14161c; }
    .gl-tag.soon { background: #d9534f; color: #fff; }
    .gl-bubble { background: #252934; border-radius: 10px; padding: 0.5rem 0.7rem; margin: 0.3rem 0; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
