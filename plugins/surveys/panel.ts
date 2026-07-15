import {
  el,
  ensureStyles,
  fmtDateTime,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

interface QuestionBase {
  id: string;
  text: string;
  dimension?: string;
}

interface ScaleQuestion extends QuestionBase {
  type: 'scale';
  options?: { min: number; max: number };
}

interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  options: { choices: string[] };
}

interface FreeTextQuestion extends QuestionBase {
  type: 'freetext';
}

type SurveyQuestion = ScaleQuestion | ChoiceQuestion | FreeTextQuestion;
type SurveyAnswers = Record<string, string | number>;

interface SurveyView {
  id: number;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  active: boolean;
  allowMultipleResponses: boolean;
  createdAt: number;
}

interface SurveyResponseView {
  id: number;
  userId: string;
  answers: SurveyAnswers;
  submittedAt: number;
}

const QUESTION_EXAMPLE = [
  {
    id: 'team_play',
    text: 'チームで遊ぶことが好きですか？',
    type: 'scale',
    dimension: 'social',
    options: { min: 1, max: 5 },
  },
  {
    id: 'favorite_genre',
    text: '好きなゲームジャンルを選んでください',
    type: 'choice',
    options: { choices: ['アクション', 'RPG', 'パズル'] },
  },
  {
    id: 'comment',
    text: '自由にコメントしてください',
    type: 'freetext',
  },
];

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  ensureSurveyStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  let selectedSurveyId: number | null = null;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '📝 アンケート'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const permissionResponse = await ctx.api('/permissions');
    if (permissionResponse.ok) {
      const permission = await permissionResponse.json() as { canCreateSurveys?: boolean };
      if (permission.canCreateSurveys === true) {
        container.appendChild(surveyCreateSection(ctx, render));
      }
    } else {
      container.appendChild(errorNotice('アンケート作成権限を Cernere から確認できませんでした。'));
    }

    const response = await ctx.api(ctx.identity.isAdmin ? '/?all=1' : '/');
    if (!response.ok) {
      container.appendChild(errorNotice('アンケートを取得できませんでした。'));
      return;
    }
    const body = await response.json() as { surveys?: SurveyView[] };
    const surveys = body.surveys ?? [];
    if (surveys.length === 0) {
      container.appendChild(el('p', 'gl-muted', '公開中のアンケートはありません。'));
      return;
    }

    const selected = surveys.find((survey) => survey.id === selectedSurveyId) ?? surveys[0];
    if (!selected) return;
    selectedSurveyId = selected.id;

    const layout = el('div', 'gl-survey-layout');
    layout.appendChild(surveyList(surveys, selected.id, (id) => {
      selectedSurveyId = id;
      void render();
    }));

    const detail = el('div', 'gl-survey-detail');
    detail.appendChild(await surveyForm(selected, ctx));
    if (ctx.identity.isAdmin) {
      detail.appendChild(adminSurveyControls(selected, ctx, render));
      detail.appendChild(await responseList(selected.id, ctx));
    }
    layout.appendChild(detail);
    container.appendChild(layout);
  }

  await render();
}

function surveyList(
  surveys: SurveyView[],
  selectedId: number,
  select: (id: number) => void,
): HTMLElement {
  const list = el('aside', 'gl-survey-list');
  list.appendChild(el('h3', undefined, 'アンケート一覧'));
  for (const survey of surveys) {
    const button = el(
      'button',
      `gl-survey-item${survey.id === selectedId ? ' selected' : ''}`,
    );
    button.type = 'button';
    button.appendChild(el('strong', undefined, survey.title));
    button.appendChild(el(
      'span',
      'gl-muted',
      `${survey.questions.length} 問${survey.allowMultipleResponses ? '・複数回答可' : ''}${survey.active ? '' : '・非公開'}`,
    ));
    button.onclick = () => select(survey.id);
    list.appendChild(button);
  }
  return list;
}

async function surveyForm(survey: SurveyView, ctx: PanelContext): Promise<HTMLElement> {
  const wrap = el('section', 'gl-survey-form');
  wrap.appendChild(el('h3', undefined, survey.title));
  if (survey.description) wrap.appendChild(el('p', 'gl-muted', survey.description));

  let existing: SurveyResponseView | null = null;
  let responseCount = 0;
  const existingResponse = await ctx.api(`/${survey.id}/response`);
  if (existingResponse.ok) {
    const body = await existingResponse.json() as {
      response?: SurveyResponseView;
      responseCount?: number;
    };
    existing = body.response ?? null;
    responseCount = body.responseCount ?? 0;
  }
  const answers: SurveyAnswers = survey.allowMultipleResponses
    ? {}
    : { ...(existing?.answers ?? {}) };
  if (existing) {
    wrap.appendChild(el(
      'p',
      'gl-notice',
      survey.allowMultipleResponses
        ? `${responseCount} 回回答済みです。送信すると新しい回答として追加されます。`
        : `回答済みです（${fmtDateTime(existing.submittedAt)}）。再送信すると回答を更新します。`,
    ));
  }

  const form = el('form', 'gl-survey-questions');
  for (const question of survey.questions) {
    form.appendChild(questionField(question, answers, survey.id));
  }
  const message = el('p', 'gl-muted');
  if (survey.active) {
    const submit = el(
      'button',
      'gl-btn',
      survey.allowMultipleResponses && existing
        ? 'もう一度回答'
        : existing ? '回答を更新' : '回答を送信',
    );
    submit.type = 'submit';
    form.onsubmit = (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = '送信中…';
      void ctx.api(`/${survey.id}/response`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        message.textContent = survey.allowMultipleResponses
          ? '新しい回答を追加しました。'
          : '回答を保存しました。';
      }).catch(() => {
        message.textContent = '回答を保存できませんでした。入力内容を確認してください。';
      }).finally(() => {
        submit.disabled = false;
      });
    };
    form.append(submit, message);
  } else {
    form.appendChild(el('p', 'gl-muted', 'このアンケートは非公開です。'));
  }
  wrap.appendChild(form);
  return wrap;
}

function questionField(
  question: SurveyQuestion,
  answers: SurveyAnswers,
  surveyId: number,
): HTMLElement {
  const field = el('fieldset', 'gl-survey-question');
  field.appendChild(el('legend', undefined, question.text));
  if (question.dimension) field.appendChild(el('span', 'gl-tag', question.dimension));

  if (question.type === 'freetext') {
    const input = el('textarea', 'gl-textarea');
    input.maxLength = 4000;
    input.value = typeof answers[question.id] === 'string' ? String(answers[question.id]) : '';
    input.oninput = () => { answers[question.id] = input.value; };
    field.appendChild(input);
    return field;
  }

  if (question.type === 'choice') {
    const choices = el('div', 'gl-choice-list');
    for (const choice of question.options.choices) {
      const label = el('label', 'gl-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = `survey-${surveyId}-${question.id}`;
      input.value = choice;
      input.checked = answers[question.id] === choice;
      input.onchange = () => { answers[question.id] = choice; };
      label.append(input, el('span', undefined, choice));
      choices.appendChild(label);
    }
    field.appendChild(choices);
    return field;
  }

  const min = question.options?.min ?? 1;
  const max = question.options?.max ?? 5;
  const row = el('div', 'gl-scale-row');
  row.appendChild(el('span', 'gl-muted', String(min)));
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.value = typeof answers[question.id] === 'number'
    ? String(answers[question.id])
    : String(min);
  const value = el('strong', 'gl-scale-value', input.value);
  input.oninput = () => {
    const answer = Number(input.value);
    answers[question.id] = answer;
    value.textContent = input.value;
  };
  row.append(input, el('span', 'gl-muted', String(max)), value);
  field.appendChild(row);
  return field;
}

function surveyCreateSection(ctx: PanelContext, rerender: () => Promise<void>): HTMLElement {
  const create = section('アンケートを作成');
  const form = el('form', 'gl-survey-admin-form');
  const title = el('input', 'gl-input');
  title.placeholder = 'タイトル';
  title.maxLength = 255;
  const description = el('textarea', 'gl-textarea');
  description.placeholder = '説明（任意）';
  description.maxLength = 4000;
  const questions = el('textarea', 'gl-textarea gl-question-json');
  questions.value = JSON.stringify(QUESTION_EXAMPLE, null, 2);
  const multipleLabel = el('label', 'gl-choice');
  const allowMultipleResponses = el('input');
  allowMultipleResponses.type = 'checkbox';
  multipleLabel.append(
    allowMultipleResponses,
    el('span', undefined, '同じユーザーが複数回回答できるようにする'),
  );
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', '作成して公開');
  submit.type = 'submit';

  form.onsubmit = (event) => {
    event.preventDefault();
    let parsedQuestions: unknown;
    try {
      parsedQuestions = JSON.parse(questions.value) as unknown;
    } catch {
      message.textContent = '設問 JSON を確認してください。';
      return;
    }
    submit.disabled = true;
    message.textContent = '作成中…';
    void ctx.api('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.value,
        description: description.value || null,
        questions: parsedQuestions,
        allowMultipleResponses: allowMultipleResponses.checked,
      }),
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return rerender();
    }).catch(() => {
      message.textContent = '作成できませんでした。タイトルと設問形式を確認してください。';
    }).finally(() => {
      submit.disabled = false;
    });
  };

  form.append(
    title,
    description,
    multipleLabel,
    el('label', undefined, '設問 JSON'),
    questions,
    submit,
    message,
  );
  create.body.appendChild(form);
  return create.wrap;
}

function adminSurveyControls(
  survey: SurveyView,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLElement {
  const controls = section('公開設定（管理者）');
  const button = el('button', 'gl-btn ghost', survey.active ? '非公開にする' : '公開する');
  button.type = 'button';
  const message = el('span', 'gl-muted');
  button.onclick = () => {
    button.disabled = true;
    void ctx.api(`/${survey.id}/active`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !survey.active }),
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return rerender();
    }).catch(() => {
      message.textContent = '公開設定を変更できませんでした。';
      button.disabled = false;
    });
  };
  controls.body.append(button, message);
  return controls.wrap;
}

async function responseList(surveyId: number, ctx: PanelContext): Promise<HTMLElement> {
  const responses = section('回答一覧（管理者）');
  const response = await ctx.api(`/${surveyId}/responses`);
  if (!response.ok) {
    responses.body.appendChild(errorNotice('回答一覧を取得できませんでした。'));
    return responses.wrap;
  }
  const body = await response.json() as { responses?: SurveyResponseView[] };
  const rows = body.responses ?? [];
  if (rows.length === 0) {
    responses.body.appendChild(el('p', 'gl-muted', 'まだ回答はありません。'));
    return responses.wrap;
  }
  const list = el('ul', 'gl-list');
  for (const row of rows) {
    const item = el('li');
    item.appendChild(el('strong', undefined, row.userId));
    item.appendChild(el('span', 'gl-muted', `  ${fmtDateTime(row.submittedAt)}`));
    const answers = el('pre', 'gl-survey-answers');
    answers.textContent = JSON.stringify(row.answers, null, 2);
    item.appendChild(answers);
    list.appendChild(item);
  }
  responses.body.appendChild(list);
  return responses.wrap;
}

function errorNotice(message: string): HTMLElement {
  const box = el('div', 'gl-notice gl-notice-error');
  box.appendChild(el('strong', undefined, message));
  return box;
}

let surveyStylesInjected = false;
function ensureSurveyStyles(): void {
  if (surveyStylesInjected) return;
  surveyStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gl-survey-layout { display: grid; grid-template-columns: minmax(14rem, 18rem) 1fr; gap: 1.25rem; }
    .gl-survey-list { display: flex; flex-direction: column; gap: 0.45rem; }
    .gl-survey-list h3 { margin: 0 0 0.35rem; }
    .gl-survey-item { display: grid; gap: 0.25rem; text-align: left; font: inherit; color: inherit;
      background: #1c1f29; border: 1px solid #2f3442; border-radius: 8px; padding: 0.7rem;
      cursor: pointer; }
    .gl-survey-item.selected { border-color: #5b8cff; background: #252d42; }
    .gl-survey-form > h3 { margin-top: 0; }
    .gl-survey-questions, .gl-survey-admin-form { display: grid; gap: 1rem; }
    .gl-survey-question { border: 1px solid #2f3442; border-radius: 10px; padding: 1rem; }
    .gl-survey-question legend { font-weight: 600; padding: 0 0.35rem; }
    .gl-choice-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
    .gl-choice { display: flex; gap: 0.4rem; align-items: center; border: 1px solid #2f3442;
      border-radius: 8px; padding: 0.4rem 0.65rem; cursor: pointer; }
    .gl-scale-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 0.75rem;
      align-items: center; margin-top: 0.75rem; }
    .gl-scale-value { color: #7aa0ff; min-width: 2rem; text-align: center; }
    .gl-question-json { min-height: 18rem; font-family: ui-monospace, monospace; }
    .gl-survey-answers { white-space: pre-wrap; color: #c7cad2; background: #1c1f29;
      border-radius: 8px; padding: 0.6rem; overflow-wrap: anywhere; }
    @media (max-width: 760px) { .gl-survey-layout { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
}
