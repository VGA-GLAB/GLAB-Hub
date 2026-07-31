import { el, ensureStyles, requireVantanUserRegistration, section, type PanelContext } from '../panel-kit.ts';

interface RoleDef { key: string; label: string; sort: number; }

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '🏷️ 役職'));
  const response = await ctx.api('/defs');
  if (!response.ok) { container.appendChild(el('p', 'gl-notice gl-notice-error', '役職を取得できませんでした。')); return; }
  const me = await ctx.api('/me');
  const mine = me.ok ? (await me.json() as { roles: string[] }).roles : [];
  const defs = (await response.json() as { defs: RoleDef[] }).defs;
  const sec = section('役職一覧');
  const list = el('ul', 'gl-list');
  for (const role of defs) list.appendChild(el('li', undefined, `${role.label} (${role.key})${mine.includes(role.key) ? ' — あなたの役職' : ''}`));
  sec.body.appendChild(list);
  container.appendChild(sec.wrap);
}
