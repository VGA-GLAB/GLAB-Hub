import { el, type PanelContext } from '../panel-kit.ts';
import type { Admission } from './contract.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  container.replaceChildren(el('h2', undefined, 'GLabの利用承認'));
  const response = await ctx.api('/requests');
  if (!response.ok) { container.append(el('p', undefined, '管理者だけが承認できます。')); return; }
  const data = await response.json() as { requests: Array<Admission & { name: string | null }> };
  for (const row of data.requests) {
    const card = el('section', 'gl-card');
    card.append(el('strong', undefined, row.name || row.user_id), el('p', undefined,
      ({ pending: '承認待ち', approved: '利用可能', rejected: '利用不可' })[row.status]));
    for (const [status, label] of [['approved', '利用を承認'], ['rejected', '利用を停止']] as const) {
      const button = el('button', 'gl-btn', label);
      button.disabled = row.status === status;
      button.onclick = async () => {
        button.disabled = true;
        try {
          const result = await ctx.api(`/requests/${encodeURIComponent(row.user_id)}`, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status, revision: row.revision }),
          });
          if (!result.ok) throw new Error('更新できませんでした。再読み込みしてください。');
          await mount(container, ctx);
        } catch (error) { card.append(el('p', 'error', String(error))); button.disabled = false; }
      };
      card.append(button);
    }
    container.append(card);
  }
}
