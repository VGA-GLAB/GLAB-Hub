import { apiJson } from '../../corpus/public/src/api.ts';
import { el } from './dom.ts';

/** Pending users get a different result: status only, no member panels or data. */
export async function renderAdmissionPending(app: HTMLElement, status: string): Promise<void> {
  app.replaceChildren(el('h1', undefined, 'GLab'), el('h2', undefined,
    status === 'rejected' ? 'GLabの利用は許可されていません' : '管理者の承認を待っています'));
  app.append(el('p', undefined, 'サービス状況は確認できます。部員向けページは承認後に利用できます。'));
  const refresh = el('button', undefined, '承認状況を確認');
  refresh.onclick = () => location.reload();
  const logout = el('button', undefined, 'ログアウト');
  logout.onclick = async () => { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); location.reload(); };
  app.append(refresh, logout, el('h2', undefined, 'サービス状況'));
  try {
    const { connectors } = await apiJson<{ connectors: Array<{ title: string; health: { status: string } }> }>('/api/hub/connectors');
    for (const connector of connectors) app.append(el('p', undefined,
      `${connector.title}: ${({ up: '稼働', degraded: '一部稼働', down: '停止' } as Record<string, string>)[connector.health.status] ?? '未確認'}`));
  } catch { app.append(el('p', undefined, 'サービス状況を取得できませんでした。')); }
}
