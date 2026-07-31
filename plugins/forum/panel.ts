import { el, ensureStyles, requireVantanUserRegistration, section, type PanelContext } from '../panel-kit.ts';

interface Thread { id: string; title: string; body: string; audienceRoles: string[]; pinned: boolean; }

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  const render = async (): Promise<void> => {
    container.innerHTML = ''; container.appendChild(el('h2', undefined, '💬 フォーラム'));
    const post = section('新規投稿');
    const title = el('input', 'gl-input') as HTMLInputElement; title.placeholder = 'タイトル';
    const body = el('textarea', 'gl-textarea') as HTMLTextAreaElement; body.placeholder = '本文';
    const audience = el('input', 'gl-input') as HTMLInputElement; audience.placeholder = '対象役職 (カンマ区切り、空欄は全員)';
    const submit = el('button', 'gl-btn', '投稿');
    submit.onclick = async () => {
      const result = await ctx.api('/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title.value.trim(), body: body.value.trim(), audienceRoles: audience.value.split(',').map((value) => value.trim()).filter(Boolean) }) });
      if (result.ok) await render();
    };
    post.body.append(title, body, audience, submit); container.appendChild(post.wrap);
    const listing = await ctx.api('/threads'); const sec = section('投稿一覧');
    if (!listing.ok) { sec.body.appendChild(el('p', 'gl-notice gl-notice-error', '投稿を取得できませんでした。')); }
    else for (const thread of (await listing.json() as { threads: Thread[] }).threads) {
      const item = el('article'); item.append(el('h3', undefined, `${thread.pinned ? '📌 ' : ''}${thread.title}`), el('p', undefined, thread.body));
      if (thread.audienceRoles.length) item.appendChild(el('span', 'gl-tag', thread.audienceRoles.join(', ')));
      sec.body.appendChild(item);
    }
    container.appendChild(sec.wrap);
  };
  await render();
}
