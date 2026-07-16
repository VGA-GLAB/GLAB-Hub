import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import {
  parseSurveyDetail,
  parseSurveyList,
  SURVEY_CATEGORIES,
  type SurveyCategory,
  type SurveyQuestion,
  type SurveyView,
} from './contracts.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  ensureSurveyStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  let activeCategory: SurveyCategory = 'game_review';
  let selectedId: string | null = null;

  const render = async (): Promise<void> => {
    container.innerHTML = '';
    const header = el('div', 'gl-row');
    header.appendChild(el('h2', undefined, '📝 レビュー・アンケート'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    header.appendChild(refresh);
    container.appendChild(header);

    const tabs = el('div', 'gl-survey-tabs');
    for (const category of SURVEY_CATEGORIES) {
      const tab = el('button', `gl-survey-tab${category.id === activeCategory ? ' active' : ''}`, category.label);
      tab.type = 'button';
      tab.onclick = () => {
        activeCategory = category.id;
        selectedId = null;
        void render();
      };
      tabs.appendChild(tab);
    }
    container.appendChild(tabs);

    const workspace = el('div', 'gl-survey-workspace');
    const list = el('div', 'gl-survey-list');
    const detail = el('div', 'gl-survey-detail');
    workspace.append(list, detail);
    container.appendChild(workspace);
    await loadList(ctx, activeCategory, list, detail, (id) => {
      selectedId = id;
      void loadDetail(ctx, id, detail, () => void render());
    });
    if (selectedId) await loadDetail(ctx, selectedId, detail, () => void render());
  };

  await render();
}

async function loadList(
  ctx: PanelContext,
  category: SurveyCategory,
  list: HTMLElement,
  detail: HTMLElement,
  select: (id: string) => void,
): Promise<void> {
  list.appendChild(el('p', 'gl-muted', '読み込み中…'));
  let response: Response;
  try {
    response = await ctx.api(`/surveys?category=${encodeURIComponent(category)}`);
  } catch {
    renderUnavailable(list, 'Volputasへ接続できませんでした。');
    return;
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as
      | { error?: string }
      | null;
    const message = body?.error === 'downstream_token_unavailable'
      ? 'サービス連携用のCernere認証を利用できません。管理者に設定確認を依頼してください。'
      : response.status === 401
        ? 'Cernereログインを確認してください。'
        : `アンケート一覧を取得できませんでした (${response.status})。`;
    renderUnavailable(list, message);
    return;
  }
  const surveys = parseSurveyList(await response.json().catch(() => null));
  if (!surveys) {
    renderUnavailable(list, 'Volputasから不正な応答を受け取りました。');
    return;
  }
  list.innerHTML = '';
  if (surveys.length === 0) {
    list.appendChild(el('p', 'gl-muted', '現在回答できるアンケートはありません。'));
    detail.appendChild(el('p', 'gl-muted', 'アンケートが公開されるとここに表示されます。'));
    return;
  }
  for (const survey of surveys) {
    const button = el('button', 'gl-survey-card');
    button.type = 'button';
    const row = el('div', 'gl-row');
    row.append(
      el('strong', undefined, survey.title),
      el('span', `gl-tag ${survey.answered ? 'closed' : 'open'}`, survey.answered ? '回答済み' : '未回答'),
    );
    button.appendChild(row);
    if (survey.description) button.appendChild(el('p', 'gl-muted', survey.description));
    button.appendChild(el('small', 'gl-muted', `${survey.questions.length}問`));
    button.onclick = () => select(survey.id);
    list.appendChild(button);
  }
}

async function loadDetail(
  ctx: PanelContext,
  surveyId: string,
  detail: HTMLElement,
  afterSave: () => void,
): Promise<void> {
  detail.innerHTML = '';
  detail.appendChild(el('p', 'gl-muted', '設問を読み込み中…'));
  const response = await ctx.api(`/surveys/${encodeURIComponent(surveyId)}`).catch(() => null);
  if (!response?.ok) {
    renderUnavailable(detail, '設問を取得できませんでした。');
    return;
  }
  const parsed = parseSurveyDetail(await response.json().catch(() => null));
  if (!parsed) {
    renderUnavailable(detail, 'Volputasから不正な設問を受け取りました。');
    return;
  }
  renderForm(ctx, detail, parsed.survey, parsed.response?.answers ?? {}, afterSave);
}

function renderForm(
  ctx: PanelContext,
  container: HTMLElement,
  survey: SurveyView,
  existingAnswers: Record<string, string | number>,
  afterSave: () => void,
): void {
  container.innerHTML = '';
  container.appendChild(el('h3', undefined, survey.title));
  if (survey.description) container.appendChild(el('p', 'gl-muted', survey.description));
  if (survey.answered) {
    container.appendChild(el('div', 'gl-notice', '回答済みです。再送信すると回答を更新します。'));
  }
  const form = el('form', 'gl-survey-form');
  const controls = new Map<string, () => string | number>();
  for (const question of survey.questions) {
    const field = renderQuestion(question, existingAnswers[question.id]);
    controls.set(question.id, field.read);
    form.appendChild(field.element);
  }
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', survey.answered ? '回答を更新' : '回答する');
  submit.type = 'submit';
  form.append(message, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = '送信中…';
    const answers = Object.fromEntries([...controls].map(([id, read]) => [id, read()]));
    void ctx.api(`/surveys/${encodeURIComponent(survey.id)}/response`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    }).then((response) => {
      if (!response.ok) {
        message.textContent = response.status === 400
          ? '入力内容を確認してください。'
          : '回答を保存できませんでした。';
        submit.disabled = false;
        return;
      }
      message.textContent = '回答を保存しました。';
      afterSave();
    }).catch(() => {
      message.textContent = '回答を保存できませんでした。';
      submit.disabled = false;
    });
  };
  container.appendChild(form);
}

function renderQuestion(question: SurveyQuestion, existing: string | number | undefined): {
  element: HTMLElement;
  read: () => string | number;
} {
  const field = el('label', 'gl-survey-field');
  field.appendChild(el('span', undefined, `${question.text}${question.required ? ' *' : ''}`));
  if (question.type === 'scale') {
    const min = question.options?.min ?? 1;
    const max = question.options?.max ?? 5;
    const input = el('input', 'gl-input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.required = question.required;
    input.value = typeof existing === 'number' ? String(existing) : '';
    field.appendChild(input);
    return { element: field, read: () => input.value === '' ? '' : Number(input.value) };
  }
  if (question.type === 'choice') {
    const select = el('select', 'gl-select');
    select.required = question.required;
    select.appendChild(el('option', undefined, '選択してください'));
    for (const choice of question.options?.choices ?? []) {
      const option = el('option', undefined, choice);
      option.value = choice;
      option.selected = existing === choice;
      select.appendChild(option);
    }
    field.appendChild(select);
    return { element: field, read: () => select.value };
  }
  const textarea = el('textarea', 'gl-textarea');
  textarea.required = question.required;
  textarea.maxLength = 4000;
  textarea.value = typeof existing === 'string' ? existing : '';
  field.appendChild(textarea);
  return { element: field, read: () => textarea.value };
}

function renderUnavailable(container: HTMLElement, message: string): void {
  container.innerHTML = '';
  const notice = el('div', 'gl-notice gl-notice-error');
  notice.appendChild(el('strong', undefined, 'アンケートを表示できません'));
  notice.appendChild(el('p', 'gl-muted', message));
  container.appendChild(notice);
}

let surveyStylesInjected = false;
function ensureSurveyStyles(): void {
  if (surveyStylesInjected) return;
  surveyStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gl-survey-tabs { display:flex; gap:.4rem; margin:1rem 0; flex-wrap:wrap; }
    .gl-survey-tab { font:inherit; color:#8b90a0; background:#1c1f29; border:1px solid #2f3442; border-radius:999px; padding:.45rem .8rem; cursor:pointer; }
    .gl-survey-tab.active { color:#fff; background:#426fd4; border-color:#5b8cff; }
    .gl-survey-workspace { display:grid; grid-template-columns:minmax(15rem, 1fr) minmax(18rem, 2fr); gap:1rem; }
    .gl-survey-list, .gl-survey-detail { min-width:0; }
    .gl-survey-card { display:block; width:100%; text-align:left; color:inherit; background:#1c1f29; border:1px solid #2f3442; border-radius:10px; padding:.8rem; margin:0 0 .6rem; cursor:pointer; }
    .gl-survey-card:hover { border-color:#5b8cff; }
    .gl-survey-form { display:grid; gap:1rem; margin-top:1rem; }
    .gl-survey-field { display:grid; gap:.4rem; font-weight:600; }
    @media (max-width: 760px) { .gl-survey-workspace { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}
