import { el, type PanelContext } from '../panel-kit.ts';
import { request } from './api.ts';

/** @implements SPEC-GLAB-LENDING-002 */
export async function mountBooks(container: HTMLElement, ctx: PanelContext): Promise<void> {
  container.replaceChildren(el('h3', undefined, '本の一覧'));
  try {
    const data = await request<{ items: Array<{ isbn: string; title: string | null; on_loan: number }> }>(ctx, '/books');
    if (!data.items.length) container.append(el('p', 'gl-muted', '所蔵している本は未登録です。'));
    for (const item of data.items) {
      const card = el('article', 'gl-card');
      card.append(el('strong', undefined, item.title ?? item.isbn),
        el('p', 'gl-muted', `ISBN ${item.isbn} · ${item.on_loan ? '貸出中' : '貸出なし'}`));
      container.append(card);
    }
  } catch (error) {
    const retry = el('button', 'gl-btn', '再読み込み'); retry.onclick = () => void mountBooks(container, ctx);
    container.append(el('p', 'gl-muted', error instanceof Error ? error.message : '本の一覧を取得できませんでした。'), retry);
  }
}

/** Administrator authority is checked by Bibliotheca, including every mutation.
 * @implements SPEC-GLAB-LENDING-002
 */
export async function mountInventoryRegistration(container: HTMLElement, ctx: PanelContext,
  reload: () => Promise<void>): Promise<void> {
  try {
    const me = await request<{ isAdmin: boolean }>(ctx, '/me');
    if (!me.isAdmin) return;
    const form = el('form', 'gl-col');
    const source = el('select', 'gl-select'); source.append(new Option('本', 'book'), new Option('機材', 'equipment'));
    const key = el('input', 'gl-input'); key.required = true; key.maxLength = 200;
    const caption = el('span', undefined, 'ISBN');
    const field = el('label', 'gl-col'); field.append(caption, key);
    source.onchange = () => { caption.textContent = source.value === 'book' ? 'ISBN' : '機材名'; key.value = ''; };
    const submit = el('button', 'gl-btn', '台帳に登録'); submit.type = 'submit';
    const message = el('p'); message.setAttribute('role', 'status');
    form.append(el('h3', undefined, '本・機材を登録'), source, field, submit, message);
    container.append(form);
    form.onsubmit = async event => {
      event.preventDefault(); submit.disabled = true; source.disabled = true; key.disabled = true;
      const book = source.value === 'book';
      try {
        await request(ctx, book ? '/books' : '/equipment', { method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(book ? { isbn: key.value.trim() } : { name: key.value.trim() }) });
        key.value = ''; message.textContent = '登録しました。'; await reload();
      } catch (error) { message.textContent = error instanceof Error ? error.message : '登録できませんでした。'; }
      finally { submit.disabled = false; source.disabled = false; key.disabled = false; }
    };
  } catch {
    container.append(el('p', 'gl-muted', '台帳の登録権限を確認できませんでした。'));
  }
}
