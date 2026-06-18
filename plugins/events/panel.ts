// events パネル — 今後のイベント一覧 + 登録フォーム。

import { el, fmtDateTime, section, ensureStyles, type PanelContext } from '../panel-kit.ts';

interface EventView {
  id: number;
  title: string;
  body: string | null;
  location: string | null;
  startsAt: number;
  createdBy: string;
  notified: boolean;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '📅 イベント'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    // --- 登録フォーム ---
    const formSec = section('イベントを登録');
    const title = el('input', 'gl-input') as HTMLInputElement;
    title.placeholder = 'タイトル (例: 6月定例集会)';
    const when = el('input', 'gl-input') as HTMLInputElement;
    when.type = 'datetime-local';
    const location = el('input', 'gl-input') as HTMLInputElement;
    location.placeholder = '場所 (任意)';
    const desc = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
    desc.placeholder = '詳細 (任意)';
    const submit = el('button', 'gl-btn', '登録');
    const msg = el('p', 'gl-muted');

    submit.onclick = async () => {
      if (!title.value.trim() || !when.value) {
        msg.textContent = 'タイトルと日時を入力してください。';
        return;
      }
      submit.setAttribute('disabled', 'true');
      msg.textContent = '送信中…';
      try {
        const res = await ctx.api('/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: title.value.trim(),
            startsAt: new Date(when.value).toISOString(),
            location: location.value || undefined,
            body: desc.value || undefined,
          }),
        });
        if (res.ok) {
          await render();
          return;
        }
        msg.textContent = `登録に失敗しました (${res.status})。`;
      } catch {
        msg.textContent = '登録に失敗しました。';
      } finally {
        submit.removeAttribute('disabled');
      }
    };

    const row1 = el('div', 'gl-row');
    row1.append(title, when, location);
    formSec.body.append(row1, desc, el('div', 'gl-row'), submit, msg);
    container.appendChild(formSec.wrap);

    // --- 今後のイベント ---
    const listSec = section('今後のイベント');
    const res = await ctx.api('/');
    if (res.ok) {
      try {
        const { events } = (await res.json()) as { events: EventView[] };
        if (events.length === 0) {
          listSec.body.appendChild(el('p', 'gl-muted', '(予定されているイベントはありません)'));
        } else {
          const ul = el('ul', 'gl-list');
          for (const ev of events) {
            const li = el('li');
            li.appendChild(el('strong', undefined, ev.title));
            li.appendChild(el('span', 'gl-muted', `  ${fmtDateTime(ev.startsAt)}`));
            if (ev.location) li.appendChild(el('span', undefined, `  @${ev.location}`));
            if (ev.notified) li.appendChild(el('span', 'gl-tag', ' 通知済'));
            if (ev.body) {
              li.appendChild(el('div', 'gl-muted', ev.body));
            }
            const del = el('button', 'gl-btn ghost', '削除');
            del.onclick = async () => {
              const d = await ctx.api(`/${ev.id}`, { method: 'DELETE' });
              if (d.ok) await render();
            };
            li.appendChild(del);
            ul.appendChild(li);
          }
          listSec.body.appendChild(ul);
        }
      } catch {
        listSec.body.appendChild(el('p', 'gl-muted', 'イベントデータの解釈に失敗しました。'));
      }
    } else {
      listSec.body.appendChild(el('p', 'gl-muted', 'イベントを取得できませんでした。'));
    }
    container.appendChild(listSec.wrap);

    container.appendChild(
      el('p', 'gl-muted', '登録したイベントは Discord の #event に自動通知 / リマインドされます。'),
    );
  }

  await render();
}
