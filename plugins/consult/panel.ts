import { el, ensureStyles, requireVantanUserRegistration, section, type PanelContext } from '../panel-kit.ts';

interface Consult { id: string; title: string; body: string; status: string; threadId: string | null; }

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  const render = async (): Promise<void> => {
    container.innerHTML = ''; container.appendChild(el('h2', undefined, '🗣️ 相談'));
    const form = section('新しい相談');
    const title = el('input', 'gl-input') as HTMLInputElement; title.placeholder = '相談のタイトル';
    const body = el('textarea', 'gl-textarea') as HTMLTextAreaElement; body.placeholder = '相談内容';
    const submit = el('button', 'gl-btn', '相談を作成');
    const message = el('p', 'gl-muted');
    submit.onclick = async () => {
      const response = await ctx.api('/consults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title.value.trim(), body: body.value.trim() }) });
      if (response.ok) await render(); else message.textContent = response.status === 429 ? '連続して相談を作成できません。少し待ってください。' : '相談を作成できませんでした。';
    };
    form.body.append(title, body, submit, message); container.appendChild(form.wrap);
    const tabs = ['open', 'resolved'] as const;
    for (const status of tabs) {
      const response = await ctx.api(`/consults?status=${status}`); const sec = section(status === 'open' ? '受付中' : '解決済み');
      if (response.ok) for (const consult of (await response.json() as { consults: Consult[] }).consults) {
        const row = el('article'); row.append(el('h3', undefined, consult.title), el('p', undefined, consult.body));
        if (consult.threadId) row.appendChild(el('span', 'gl-muted', `Discord スレッド: ${consult.threadId}`)); sec.body.appendChild(row);
      }
      container.appendChild(sec.wrap);
    }
  };
  await render();
}
