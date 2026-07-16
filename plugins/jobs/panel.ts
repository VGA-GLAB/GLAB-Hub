// jobs パネル — 本人の就活データ (Cernere) + 求人情報の検索 / 一覧 / 投稿 (glab_job)。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';

interface StudentCareer {
  desiredRole: string;
  portfolioUrl: string;
  careerNote: string;
  isPublic: boolean;
}

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
  if (!await requireVantanUserRegistration(container, ctx)) return;
  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '💼 就活'));

  const careerHost = el('div');
  const jobsHost = el('div');
  container.append(careerHost, jobsHost);
  await Promise.all([
    renderCareer(careerHost, ctx),
    renderJobs(jobsHost, ctx),
  ]);
}

// --- 本人データ (Cernere tirocinium_student_career) ---

async function renderCareer(host: HTMLElement, ctx: PanelContext): Promise<void> {
  const response = await ctx.api('/career');
  if (!response.ok) {
    host.appendChild(el('p', 'gl-notice gl-notice-error', 'Cernereの就活データを取得できません。'));
    return;
  }
  const { career } = await response.json() as { career: StudentCareer };
  const form = section('本人データ');
  const desiredRole = input('希望職種', career.desiredRole);
  const portfolioUrl = input('ポートフォリオURL', career.portfolioUrl);
  const note = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
  note.placeholder = '就活メモ';
  note.value = career.careerNote;
  note.maxLength = 4_000;
  const visibility = el('label', 'gl-row');
  const isPublic = el('input') as HTMLInputElement;
  isPublic.type = 'checkbox';
  isPublic.checked = career.isPublic;
  visibility.append(isPublic, document.createTextNode('Tr / GLAB内で公開する'));
  const save = el('button', 'gl-btn', '保存');
  const message = el('p', 'gl-muted');
  save.onclick = async () => {
    save.setAttribute('disabled', 'true');
    const saved = await ctx.api('/career', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        desiredRole: desiredRole.value.trim(),
        portfolioUrl: portfolioUrl.value.trim(),
        careerNote: note.value.trim(),
        isPublic: isPublic.checked,
      }),
    });
    message.textContent = saved.ok ? '保存しました。' : `保存に失敗しました (${saved.status})。`;
    save.removeAttribute('disabled');
  };
  form.body.append(desiredRole, portfolioUrl, note, visibility, save, message);
  host.appendChild(form.wrap);
}

// --- 求人情報 (glab_job、Discord Bot /job と共有) ---

async function renderJobs(host: HTMLElement, ctx: PanelContext): Promise<void> {
  let searchQ = '';
  let statusFilter: 'open' | 'all' = 'open';

  async function render(): Promise<void> {
    host.innerHTML = '';

    // --- 投稿フォーム ---
    const formSec = section('就活情報を投稿');
    const company = input('企業名 (必須)', '');
    const position = input('募集 / 職種', '');
    const category = input('業種 (例: ゲーム)', '');
    const url = input('URL', '');
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
    host.appendChild(formSec.wrap);

    // --- 検索 / フィルタ + 一覧 ---
    const filterSec = section('求人一覧');
    const filterRow = el('div', 'gl-row');
    const searchBox = input('企業 / 職種 / 本文を検索', searchQ);
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
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    filterRow.append(searchBox, searchBtn, toggle, refresh);
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
          for (const job of jobs) ul.appendChild(jobRow(job, ctx, render));
          filterSec.body.appendChild(ul);
        }
      } catch {
        filterSec.body.appendChild(el('p', 'gl-muted', '就活データの解釈に失敗しました。'));
      }
    } else {
      filterSec.body.appendChild(el('p', 'gl-muted', '就活情報を取得できませんでした。'));
    }
    host.appendChild(filterSec.wrap);
  }

  await render();
}

function jobRow(job: JobView, ctx: PanelContext, rerender: () => Promise<void>): HTMLLIElement {
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
      el('span', soon ? 'gl-tag soon' : 'gl-muted', `締切 ${fmtDateTime(job.deadlineAt)}`),
    );
  }
  if (job.body) li.appendChild(el('div', 'gl-muted', job.body));

  if (job.status === 'open') {
    const close = el('button', 'gl-btn ghost', '募集終了にする');
    close.onclick = async () => {
      const d = await ctx.api(`/${job.id}/close`, { method: 'POST' });
      if (d.ok) await rerender();
    };
    li.appendChild(close);
  }
  return li;
}

function input(placeholder: string, value: string): HTMLInputElement {
  const element = el('input', 'gl-input') as HTMLInputElement;
  element.placeholder = placeholder;
  element.value = value;
  return element;
}
