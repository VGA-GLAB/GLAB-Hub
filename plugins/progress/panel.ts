// progress パネル — Calliope の PJ 進捗 (sprint health / burndown / risk / 停滞タスク)。
//
// このファイルは取得と組み立ての段取りだけを持つ。 表示要素の生成は progress-view.ts。
// エンジンは Calliope 側なので、 ここでは read して並べるだけ (自前 DB キャッシュなし)。

import {
  el,
  ensureStyles,
  connectorGuard,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import { renderProjects, type ProgressResponse } from './progress-view.ts';

const SERVICE_LABEL = 'Calliope (PM進捗)';

function headerRow(onRefresh: () => void): HTMLElement {
  const head = el('div', 'gl-row');
  head.appendChild(el('h2', undefined, '📈 進捗'));
  const refresh = el('button', 'gl-btn ghost', '更新');
  refresh.onclick = onRefresh;
  head.appendChild(refresh);
  return head;
}

/** 取得結果を本文要素にする。 未接続 / 取得失敗は connectorGuard の通知を返す。 */
async function body(fetching: Promise<Response>): Promise<HTMLElement> {
  let res: Response;
  try {
    res = await fetching;
  } catch {
    // hub 自体に届かない (オフライン / hub 再起動中)。 更新ボタン経由の再描画で
    // 未処理の rejection にせず、 ヘッダだけの空パネルにもしない。
    return el('p', 'gl-muted', `${SERVICE_LABEL} の取得に失敗しました。`);
  }
  const guard = await connectorGuard(res, SERVICE_LABEL);
  if (guard) return guard;
  try {
    const data = await res.json() as ProgressResponse;
    return renderProjects(data.projects ?? []);
  } catch {
    return el('p', 'gl-muted', '進捗データの解釈に失敗しました。');
  }
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  // 他パネルと同じく、Cernere の必須プロフィール登録を先に通す。
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    container.appendChild(headerRow(() => void render()));
    container.appendChild(await body(ctx.api('/progress')));
  }

  await render();
}
