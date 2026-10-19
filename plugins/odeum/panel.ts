// 配信パネル。イベントを任意で選んで開始し、接続状態と視聴画面を表示する。

import { el, ensureStyles, requireVantanUserRegistration, type PanelContext } from '../panel-kit.ts';
import { endSession, loadLiveSummary, renderLiveCards } from './live-card.ts';
import { mountViewer, type ViewerHandle } from './viewer-ui.ts';
import { streamStartControls } from './start-controls.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  let viewer: ViewerHandle | null = null;
  let generation = 0;

  async function render(): Promise<void> {
    const current = ++generation;
    viewer?.dispose();
    viewer = null;
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '🎤 ライブ配信'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const stage = el('div');
    container.appendChild(stage);

    const summary = await loadLiveSummary(ctx);
    if (current !== generation || !container.isConnected) return;
    if (!summary) {
      container.appendChild(el('p', 'gl-notice gl-notice-error', '配信中のセッションを取得できませんでした。'));
      return;
    }
    container.appendChild(streamStartControls(ctx, summary.enabled));
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
      container.appendChild(el('p', 'gl-muted', '現在、準備中・配信中のセッションはありません。'));
    }
    if (!summary.relayReachable && summary.sessions.length > 0 && summary.enabled) {
      container.appendChild(el('p', 'gl-muted', '中継サーバに接続できないため、配信状態は台帳の情報だけを表示しています。'));
    }
  }

  await render();
}
