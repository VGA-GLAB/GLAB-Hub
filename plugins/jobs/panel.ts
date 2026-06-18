// jobs パネル — 就活情報の検索 / 一覧 + 投稿フォーム。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  type PanelContext,
} from '../panel-kit.ts';

interface JobView {
  id: number;
  company: string;
  position: string | null;
  category: string | null;
  url: string | null;
  body: string | null;
  deadlineAt: number | null;
  status: string;
}

const DAY = 86_400_000;

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();

  let searchQ = '';
  let statusFilter: 'open' | 'all' = 'open';

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '💼 就活情報'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    // --- 投稿フォーム ---
    const formSec = section('就活情報を投稿');
    const company = el('input', 'gl-input') as HTMLInputElement;
    company.placeholder = '企業名 (必須)';
    const position = el('input', 'gl-input') as HTMLInputElement;
    position.placeholder = '募集 / 職種';
    const category = el('input', 'gl-input') as HTMLInputElement;
    category.placeholder = '業種 (例: ゲーム)';
    const url = el('input', 'gl-input') as HTMLInputElement;
    url.placeholder = 'URL';
    const deadline = el('input', 'gl-input') as HTMLInputElement;
    deadline.type = 'datetime-local';
    const desc = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
    desc.placeholder = '詳細 (任意)';
    const submit = el('button', 'gl-btn', '投稿');
    const msg = el('p', 'gl-muted');

    submit.onclick = async () => {
      if (!company.value.trim()) {
        msg.textContent = '企業名を入力してください。';
        return;
      }
      submit.setAttribute('disabled', 'true');
      msg.textContent = '送信中…';
      try {
        const res = await ctx.api('/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            company: company.value.trim(),
            position: position.value || undefined,
            category: category.value || undefined,
            url: url.value || undefined,
            body: desc.value || undefined,
            deadlineAt: deadline.value ? new Date(deadline.value).toISOString() : undefined,
          }),
        });
        if (res.ok) {
          await render();
          return;
        }
        msg.textContent = `投稿に失敗しました (${res.status})。`;
      } catch {
        msg.textContent = '投稿に失敗しました。';
      } finally {
        submit.removeAttribute('disabled');
      }
    };

    const row1 = el('div', 'gl-row');
    row1.append(company, position, category);
    const row2 = el('div', 'gl-row');
    row2.append(url, deadline);
    formSec.body.append(row1, row2, desc, submit, msg);
    container.appendChild(formSec.wrap);

    // --- 検索 / フィルタ ---
    const filterSec = section('一覧');
    const filterRow = el('div', 'gl-row');
    const searchBox = el('input', 'gl-input') as HTMLInputElement;
    searchBox.placeholder = '企業 / 職種 / 本文を検索';
    searchBox.value = searchQ;
    const searchBtn = el('button', 'gl-btn ghost', '検索');
    searchBtn.onclick = () => {
      searchQ = searchBox.value.trim();
      void render();
    };
    const toggle = el('button', 'gl-btn ghost', statusFilter === 'open' ? '募集中のみ' : 'すべて');
    toggle.onclick = () => {
      statusFilter = statusFilter === 'open' ? 'all' : 'open';
      void render();
    };
    filterRow.append(searchBox, searchBtn, toggle);
    filterSec.body.appendChild(filterRow);

    const params = new URLSearchParams();
    params.set('status', statusFilter);
    if (searchQ) params.set('q', searchQ);
    const res = await ctx.api(`/?${params.toString()}`);
    if (res.ok) {
      try {
        const { jobs } = (await res.json()) as { jobs: JobView[] };
        if (jobs.length === 0) {
          filterSec.body.appendChild(el('p', 'gl-muted', '(該当する就活情報はありません)'));
        } else {
          const ul = el('ul', 'gl-list');
          for (const job of jobs) {
            const li = el('li');
            const titleLine = el('div', 'gl-row');
            const name = job.url ? (el('a') as HTMLAnchorElement) : el('strong');
            if (job.url && name instanceof HTMLAnchorElement) {
              name.href = job.url;
              name.target = '_blank';
              name.rel = 'noopener';
            }
            name.textContent = job.company;
            titleLine.appendChild(name);
            if (job.position) titleLine.appendChild(el('span', undefined, job.position));
            if (job.category) titleLine.appendChild(el('span', 'gl-tag', job.category));
            if (job.status === 'closed') titleLine.appendChild(el('span', 'gl-tag closed', '終了'));
            li.appendChild(titleLine);

            if (job.deadlineAt) {
              const soon = job.deadlineAt - Date.now() < 3 * DAY;
              li.appendChild(
                el(
                  'span',
                  soon ? 'gl-tag soon' : 'gl-muted',
                  `締切 ${fmtDateTime(job.deadlineAt)}`,
                ),
              );
            }
            if (job.body) li.appendChild(el('div', 'gl-muted', job.body));

            if (job.status === 'open') {
              const close = el('button', 'gl-btn ghost', '募集終了にする');
              close.onclick = async () => {
                const d = await ctx.api(`/${job.id}/close`, { method: 'POST' });
                if (d.ok) await render();
              };
              li.appendChild(close);
            }
            ul.appendChild(li);
          }
          filterSec.body.appendChild(ul);
        }
      } catch {
        filterSec.body.appendChild(el('p', 'gl-muted', '就活データの解釈に失敗しました。'));
      }
    } else {
      filterSec.body.appendChild(el('p', 'gl-muted', '就活情報を取得できませんでした。'));
    }
    container.appendChild(filterSec.wrap);
  }

  await render();
}
