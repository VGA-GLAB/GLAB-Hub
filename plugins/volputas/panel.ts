import {
  connectorGuard,
  el,
  ensureStyles,
  fmtDateTime,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import {
  parseSurveyDetail,
  parseSurveyList,
  parseRecentGames,
  parseReviewList,
  SURVEY_CATEGORIES,
  type SurveyCategory,
  type ReviewView,
  type SurveyQuestion,
  type SurveyView,
} from './contracts.ts';
import { createOmnipotensReviewSection } from './omnipotens-panel.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  ensureSurveyStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  // projects パネルの「感想を書く」から ?projectId= 付きで戻ってきたときの初期絞り込み。
  let projectFilter = new URLSearchParams(window.location.search).get('projectId');
  // その導線で来たときは感想タブを開く (ほかのタブから探させない)。
  let activeCategory: SurveyCategory | 'reviews' = projectFilter ? 'reviews' : 'game_review';
  let selectedId: string | null = null;

  // 絞り込みは初期値を URL から読むので、 変更も URL に書き戻す。
  // そうしないとパネルが再 mount されたときに解除が巻き戻る。
  const applyProjectFilter = (next: string | null): void => {
    projectFilter = next;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('projectId', next);
    else url.searchParams.delete('projectId');
    window.history.replaceState(null, '', url);
  };

  const render = async (): Promise<void> => {
    container.innerHTML = '';
    const header = el('div', 'gl-row');
    header.appendChild(el('h2', undefined, '📝 レビュー・アンケート'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    header.appendChild(refresh);
    container.appendChild(header);

    container.appendChild(await createOmnipotensReviewSection(ctx));

    const tabs = el('div', 'gl-survey-tabs');
    for (const category of [...SURVEY_CATEGORIES, { id: 'reviews' as const, label: '感想' }]) {
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

    const category = activeCategory;
    if (category === 'reviews') {
      await renderReviewFeed(ctx, container, projectFilter, (next) => {
        applyProjectFilter(next);
        void render();
      });
      return;
    }

    const workspace = el('div', 'gl-survey-workspace');
    const list = el('div', 'gl-survey-list');
    const detail = el('div', 'gl-survey-detail');
    workspace.append(list, detail);
    container.appendChild(workspace);
    await loadList(ctx, category, list, detail, (id) => {
      selectedId = id;
      void loadDetail(ctx, id, detail, () => void render());
    });
    if (selectedId) await loadDetail(ctx, selectedId, detail, () => void render());
  };

  await render();
}

async function renderReviewFeed(
  ctx: PanelContext,
  container: HTMLElement,
  projectId: string | null,
  setProjectFilter: (next: string | null) => void,
): Promise<void> {
  const workspace = el('div', 'gl-review-workspace');
  const feed = el('div', 'gl-review-feed');
  const form = el('div', 'gl-review-form-wrap');
  workspace.append(feed, form);
  container.appendChild(workspace);
  await Promise.all([
    loadReviews(ctx, feed, projectId, setProjectFilter),
    renderReviewForm(ctx, form, projectId, () => {
      void loadReviews(ctx, feed, projectId, setProjectFilter);
    }),
  ]);
}

async function loadReviews(
  ctx: PanelContext,
  container: HTMLElement,
  projectId: string | null,
  setProjectFilter: (next: string | null) => void,
): Promise<void> {
  // 見出し (と絞り込み解除ボタン) は取得結果に依存しないので先に置く。
  // 取得失敗時も本文だけ差し替えることで、 絞り込みから抜ける導線を残す。
  container.innerHTML = '';
  const heading = el('div', 'gl-row');
  heading.appendChild(el('h3', undefined, projectId ? 'このプロジェクトの感想' : 'みんなの感想'));
  if (projectId) {
    const clear = el('button', 'gl-btn ghost', '絞り込みを解除');
    clear.type = 'button';
    clear.onclick = () => setProjectFilter(null);
    heading.appendChild(clear);
  }
  const body = el('div', 'gl-review-list');
  container.append(heading, body);
  body.appendChild(el('p', 'gl-muted', '感想を読み込み中…'));

  const path = projectId ? `/reviews?projectId=${encodeURIComponent(projectId)}` : '/reviews';
  const response = await ctx.api(path).catch(() => null);
  if (!response) {
    renderUnavailable(body, 'Volputasへ接続できませんでした。', '感想を表示できません');
    return;
  }
  const guard = await connectorGuard(response, 'Volputas');
  if (guard) {
    body.replaceChildren(guard);
    return;
  }
  const reviews = parseReviewList(await response.json().catch(() => null));
  if (!reviews) {
    renderUnavailable(body, 'Volputasから不正な感想応答を受け取りました。', '感想を表示できません');
    return;
  }
  body.replaceChildren(
    ...(reviews.length === 0
      ? [el('p', 'gl-muted', 'まだ公開された感想はありません。')]
      : reviews.map(reviewCard)),
  );
}

function reviewCard(review: ReviewView): HTMLElement {
  const card = el('article', 'gl-review-card');
  const row = el('div', 'gl-row');
  row.appendChild(el('strong', undefined, review.gameTitle));
  const label = review.recommend === true ? 'お勧め' : review.recommend === false ? 'お勧めしない' : '感想';
  const tone = review.recommend === true ? 'open' : review.recommend === false ? 'soon' : '';
  row.appendChild(el('span', `gl-tag ${tone}`.trim(), label));
  card.appendChild(row);
  card.appendChild(el('p', undefined, review.comment));
  const author = 'name' in review.author ? review.author.name : `匿名 (${review.author.pseudo})`;
  const postedAt = Date.parse(review.createdAt);
  card.appendChild(el(
    'small',
    'gl-muted',
    Number.isFinite(postedAt) ? `${author} · ${fmtDateTime(postedAt)}` : author,
  ));
  return card;
}

async function renderReviewForm(
  ctx: PanelContext,
  container: HTMLElement,
  projectId: string | null,
  afterPost: () => void,
): Promise<void> {
  container.appendChild(el('h3', undefined, '感想を投稿'));
  container.appendChild(el('p', 'gl-muted', '公開すると GLAB と Discord に掲載されます。'));
  const form = el('form', 'gl-review-form');
  const gameTitle = el('input', 'gl-input') as HTMLInputElement;
  gameTitle.placeholder = 'ゲーム名';
  gameTitle.required = true;
  const suggestions = el('div', 'gl-review-suggestions');
  const recommend = el('input') as HTMLInputElement;
  recommend.type = 'checkbox';
  recommend.checked = true;
  const toggle = el('label', 'gl-row');
  const recommendLabel = el('span', undefined, 'お勧めする');
  recommend.onchange = () => {
    recommendLabel.textContent = recommend.checked ? 'お勧めする' : 'お勧めしない';
  };
  toggle.append(recommend, recommendLabel);
  const comment = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
  comment.placeholder = '感想本文';
  comment.required = true;
  comment.maxLength = 4000;
  const anonymous = el('input') as HTMLInputElement;
  anonymous.type = 'checkbox';
  const anonymousLabel = el('label', 'gl-row');
  anonymousLabel.append(anonymous, el('span', undefined, '匿名で投稿'));
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', '公開して投稿');
  submit.type = 'submit';
  form.append(gameTitle, suggestions, toggle, comment, anonymousLabel, message, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    // required は空白のみの入力を通してしまうので、 trim 後の中身で判定する。
    const title = gameTitle.value.trim();
    const bodyText = comment.value.trim();
    if (!title || !bodyText) {
      message.textContent = 'ゲーム名と感想本文を入力してください。';
      return;
    }
    submit.disabled = true;
    message.textContent = '投稿中…';
    const isRecommended = recommend.checked;
    void ctx.api('/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameTitle: title,
        polarity: isRecommended ? 'like' : 'dislike',
        recommend: isRecommended,
        comment: bodyText,
        glabProjectId: projectId,
        anonymous: anonymous.checked,
        visibility: 'community',
      }),
    }).then((response) => {
      // 未接続 (503) と本当の失敗を混ぜると「投稿できない理由」が伝わらない。
      if (!response.ok) {
        message.textContent = response.status === 503
          ? 'Volputas に未接続のため投稿できません。'
          : `感想を投稿できませんでした (${response.status})。`;
        submit.disabled = false;
        return;
      }
      message.textContent = '感想を公開しました。';
      gameTitle.value = '';
      comment.value = '';
      submit.disabled = false;
      afterPost();
    }).catch(() => {
      message.textContent = '感想を投稿できませんでした。';
      submit.disabled = false;
    });
  };
  container.appendChild(form);
  await loadRecentGames(ctx, suggestions, gameTitle);
}

async function loadRecentGames(
  ctx: PanelContext,
  container: HTMLElement,
  gameTitle: HTMLInputElement,
): Promise<void> {
  const response = await ctx.api('/recent-games').catch(() => null);
  if (!response?.ok) return;
  const games = parseRecentGames(await response.json().catch(() => null));
  if (!games || games.length === 0) return;
  container.appendChild(el('span', 'gl-muted', '最近遊んだゲーム:'));
  for (const game of games) {
    const button = el('button', 'gl-btn ghost', game.name);
    button.type = 'button';
    button.title = `${game.playtimeTwoWeeksMinutes}分`;
    button.onclick = () => { gameTitle.value = game.name; };
    container.appendChild(button);
  }
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
    const placeholder = el('option', undefined, '選択してください');
    placeholder.value = '';
    select.appendChild(placeholder);
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

function renderUnavailable(
  container: HTMLElement,
  message: string,
  title = 'アンケートを表示できません',
): void {
  container.innerHTML = '';
  const notice = el('div', 'gl-notice gl-notice-error');
  notice.appendChild(el('strong', undefined, title));
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
    .gl-review-workspace { display:grid; grid-template-columns:minmax(18rem, 2fr) minmax(15rem, 1fr); gap:1rem; }
    .gl-review-feed, .gl-review-form-wrap { min-width:0; }
    .gl-review-card { background:#1c1f29; border:1px solid #2f3442; border-radius:10px; padding:.8rem; margin:0 0 .6rem; }
    .gl-review-card p { white-space:pre-wrap; overflow-wrap:anywhere; }
    .gl-review-form { display:grid; gap:.8rem; }
    .gl-review-suggestions { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
    @media (max-width: 760px) {
      .gl-review-workspace, .gl-survey-workspace { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}
