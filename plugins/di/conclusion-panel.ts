import { el, section, type PanelContext } from '../panel-kit.ts';
import { parsePublishedConclusions } from './conclusion-contract.ts';

export function mountConclusions(container: HTMLElement, ctx: PanelContext): void {
  const view = section('本社の議論結果');
  const list = el('div');
  const message = el('p', 'gl-muted');
  const refresh = el('button', 'gl-btn', '更新');
  let generation = 0;
  const clear = (): void => { generation++; list.replaceChildren(); message.textContent = '更新すると、現在公開されている結果を表示します。'; };
  const load = async (): Promise<void> => {
    const current = ++generation;
    list.replaceChildren();
    message.textContent = '読み込み中…';
    refresh.disabled = true;
    try {
      const response = await ctx.api('/conclusions');
      if (!response.ok) throw new Error('本社Diの議論結果を取得できませんでした。接続設定とログイン状態を確認してください。');
      const rows = parsePublishedConclusions(await response.json());
      if (!rows) throw new Error('議論結果の形式を確認できませんでした。');
      if (current !== generation) return;
      message.textContent = rows.length ? '公開可能で、公開範囲が「全公開」「GLab」の結果です。' : '現在公開されている議論結果はありません。';
      for (const row of rows) {
        const card = el('article', 'gl-card');
        card.append(el('h3', undefined, row.title), el('p', 'gl-muted', `${row.scope === 'public' ? '全公開' : 'GLab'} · ${new Date(row.updatedAt).toLocaleString('ja-JP')}`));
        const open = el('button', 'gl-btn', '結論を読む');
        const detail = el('p');
        detail.style.whiteSpace = 'pre-wrap';
        open.onclick = () => {
          detail.textContent = '';
          open.disabled = true;
          void ctx.api(`/conclusions?id=${encodeURIComponent(row.id)}`).then(async response => {
            if (!response.ok) throw new Error('現在は閲覧できません。公開が取り消された可能性があります。');
            const result = parsePublishedConclusions(await response.json());
            if (result?.length !== 1 || result[0]?.id !== row.id) throw new Error('議論結果を確認できませんでした。');
            if (current === generation) detail.textContent = result[0].conclusion;
          }).catch((error: unknown) => {
            if (current === generation) detail.textContent = error instanceof Error ? error.message : '取得できませんでした。';
          }).finally(() => { open.disabled = false; });
        };
        card.append(open, detail);
        list.append(card);
      }
    } catch (error) {
      if (current === generation) message.textContent = error instanceof Error ? error.message : '取得できませんでした。';
    } finally { refresh.disabled = false; }
  };
  refresh.onclick = () => { void load(); };
  view.body.append(refresh, message, list);
  container.append(view.wrap);
  // Do not retain disclosed text across background/resume. Listener is owned by
  // this panel and removed when the panel leaves the document.
  const onVisibility = (): void => { if (document.hidden) clear(); };
  document.addEventListener('visibilitychange', onVisibility);
  const observer = new MutationObserver(() => {
    if (!view.wrap.isConnected) {
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  void load();
}
