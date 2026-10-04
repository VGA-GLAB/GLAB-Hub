// ライブ発表パネル。 発表中のセッション一覧と視聴画面。
// 発表の開始はイベント画面の「発表を始める」から行う (作成者 / 管理者のみ)。

import { el, ensureStyles, requireVantanUserRegistration, type PanelContext } from '../panel-kit.ts';
import { endSession, loadLiveSummary, renderLiveCards } from './live-card.ts';
import { mountViewer, type ViewerHandle } from './viewer-ui.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  let viewer: ViewerHandle | null = null;

  async function render(): Promise<void> {
    viewer?.dispose();
    viewer = null;
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '🎤 ライブ発表'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const stage = el('div');
    container.appendChild(stage);

    const summary = await loadLiveSummary(ctx);
    if (!summary) {
      container.appendChild(el('p', 'gl-notice gl-notice-error', '発表中のセッションを取得できませんでした。'));
      return;
    }
    const cards = renderLiveCards(summary, {
      onWatch: (card) => {
        viewer?.dispose();
        viewer = mountViewer(stage, ctx, card.sessionId, () => { viewer = null; });
        stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      onEnd: (card) => {
        void endSession(ctx, card.sessionId).then(() => render());
      },
    });
    if (cards) {
      container.appendChild(cards);
    } else {
      container.appendChild(el('p', 'gl-muted', 'いま発表中のイベントはありません。'));
    }
    if (!summary.relayReachable && summary.sessions.length > 0 && summary.enabled) {
      container.appendChild(el('p', 'gl-muted', '中継サーバに接続できないため、配信状態は台帳の情報だけを表示しています。'));
    }
    container.appendChild(el('p', 'gl-muted',
      '発表を始めるには、イベント画面で自分が登録したイベントの「発表を始める」を押してください。'));
  }

  await render();
}
