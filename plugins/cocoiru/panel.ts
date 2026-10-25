import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';

/** Shows only unexpired Cocoiru availability; refresh never changes presence. */
export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  container.replaceChildren(el('h2', undefined, 'アクティブなメンバー'));
  const refresh = el('button', 'gl-btn', '更新');
  refresh.onclick = () => void mount(container, ctx);
  container.append(refresh, el('p', 'gl-muted', 'Cocoiruで在席中のメンバーです。'));
  try {
    const response = await ctx.api('/active-members');
    if (!response.ok) throw new Error('unavailable');
    const { members } = await response.json() as { members: Array<{ userId: string; name: string | null }> };
    if (!members.length) container.append(el('p', 'gl-muted', '現在アクティブなメンバーはいません。'));
    for (const member of members) container.append(el('p', undefined, member.name || member.userId));
  } catch { container.append(el('p', 'error', '在席状況を取得できませんでした。')); }
}
