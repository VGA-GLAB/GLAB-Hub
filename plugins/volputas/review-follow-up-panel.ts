// 感想を投稿した直後に出す「追加の質問」と「体験解析」。質問は一問ずつ、答えてもスキップしても
// 次の質問へ進む。解析は本人が AI へ送ることを確認したときだけ実行する (Voluptas が consent を検査)。

import { el, type PanelContext } from '../panel-kit.ts';
import {
  parseFollowUpQuestion,
  parseVoiceAnalysis,
  type FollowUpQuestion,
  type VoiceAnalysisView,
} from './review-follow-up-contract.ts';

const VALENCE_LABELS = { positive: '😊', neutral: '😐', negative: '😣' } as const;

async function errorText(response: Response | null, fallback: string): Promise<string> {
  if (!response) return fallback;
  if (response.status === 503) return 'Voluptas に未接続です。';
  const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;
  return typeof message === 'string' && message.length < 200 ? message : `${fallback} (${response.status})`;
}

/** 追加の質問。answer/skip のたびに Voluptas が次の質問を返す。null になったら解析の欄へ進む。 */
export function renderFollowUp(ctx: PanelContext, container: HTMLElement, recordId: string): void {
  const box = el('section', 'gl-review-follow-up');
  container.replaceChildren(box);
  const path = `/reviews/${encodeURIComponent(recordId)}/follow-up`;

  const showQuestion = (question: FollowUpQuestion | null): void => {
    box.replaceChildren();
    if (!question) {
      box.append(el('p', 'gl-muted', '追加の質問はここまでです。ありがとうございました。'));
      renderAnalysis(ctx, box, recordId);
      return;
    }
    box.append(el('h4', undefined, '追加の質問 (任意)'), el('p', undefined, question.prompt));
    const message = el('p', 'gl-muted');
    const send = async (body: Record<string, unknown>): Promise<void> => {
      buttons.forEach((button) => { button.disabled = true; });
      const response = await ctx.api(path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => null);
      if (!response?.ok) {
        message.textContent = await errorText(response, '回答を保存できませんでした');
        buttons.forEach((button) => { button.disabled = false; });
        return;
      }
      const next = parseFollowUpQuestion(await response.json().catch(() => null));
      if (next === undefined) { message.textContent = 'Voluptas から不正な応答を受け取りました。'; return; }
      showQuestion(next);
    };
    const buttons: HTMLButtonElement[] = [];
    const row = el('div', 'gl-row');
    if (question.answerType === 'choice') {
      for (const option of question.options) {
        const button = el('button', 'gl-btn ghost', option.label) as HTMLButtonElement;
        button.type = 'button';
        // 選択肢の値は Voluptas の文字列のまま返す (感情の「中立」は 0 として記録され、未回答の null と区別される)。
        button.onclick = () => void send({ questionId: question.id, answer: option.value });
        buttons.push(button);
        row.append(button);
      }
    } else {
      const input = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
      input.maxLength = 1000;
      const answer = el('button', 'gl-btn', '回答する') as HTMLButtonElement;
      answer.type = 'button';
      answer.onclick = () => {
        if (!input.value.trim()) { message.textContent = '回答を入力するか、スキップしてください。'; return; }
        void send({ questionId: question.id, answer: input.value.trim() });
      };
      buttons.push(answer);
      box.append(input);
      row.append(answer);
    }
    const skip = el('button', 'gl-btn ghost', 'スキップ') as HTMLButtonElement;
    skip.type = 'button';
    skip.onclick = () => void send({ questionId: question.id, skip: true });
    buttons.push(skip);
    row.append(skip);
    box.append(row, message);
  };

  box.append(el('p', 'gl-muted', '追加の質問を確認中…'));
  void ctx.api(path).then(async (response) => {
    if (!response.ok) { box.replaceChildren(el('p', 'gl-muted', await errorText(response, '追加の質問を取得できませんでした'))); return; }
    const question = parseFollowUpQuestion(await response.json().catch(() => null));
    if (question === undefined) { box.replaceChildren(el('p', 'gl-muted', 'Voluptas から不正な応答を受け取りました。')); return; }
    showQuestion(question);
  }).catch(() => {
    box.replaceChildren(el('p', 'gl-muted', '追加の質問を取得できませんでした。'));
  });
}

function analysisSummary(view: VoiceAnalysisView): HTMLElement {
  const wrap = el('div', 'gl-col');
  if (view.state !== 'complete') {
    wrap.append(el('p', 'gl-muted', view.state === 'stale' ? '感想が更新されたため、前回の解析は古くなっています。' : 'まだ解析していません。'));
    return wrap;
  }
  wrap.append(el('p', 'gl-muted', `体験の出来事 ${view.events.length} 件・観測 ${view.observationCount} 件を感想の原文から読み取りました。`));
  const list = el('ul', 'gl-list');
  for (const event of view.events) {
    list.append(el('li', undefined, `${event.valence ? VALENCE_LABELS[event.valence] : '・'} ${event.label}`));
  }
  wrap.append(list);
  return wrap;
}

/** 体験解析。状態を読み、本人の確認があれば POST { consent: true } で解析する。 */
export function renderAnalysis(ctx: PanelContext, container: HTMLElement, recordId: string): void {
  const box = el('div', 'gl-review-analysis');
  container.append(box);
  const path = `/reviews/analysis/${encodeURIComponent(recordId)}`;
  const show = (view: VoiceAnalysisView | null, note = ''): void => {
    box.replaceChildren(el('h4', undefined, '体験の解析 (任意)'));
    if (view) box.append(analysisSummary(view));
    if (!view || view.state !== 'complete') {
      const consent = el('input') as HTMLInputElement;
      consent.type = 'checkbox';
      const label = el('label', 'gl-row');
      label.append(consent, el('span', undefined, 'この感想を AI に送って解析することに同意する'));
      const run = el('button', 'gl-btn ghost', '解析する') as HTMLButtonElement;
      run.type = 'button';
      run.onclick = async () => {
        if (!consent.checked) { show(view, '解析するには同意にチェックしてください。'); return; }
        run.disabled = true;
        show(view, '解析中…');
        const response = await ctx.api(path, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }),
        }).catch(() => null);
        if (!response?.ok) { show(view, await errorText(response, '解析できませんでした')); return; }
        const next = parseVoiceAnalysis(await response.json().catch(() => null));
        show(next, next ? '' : 'Voluptas から不正な応答を受け取りました。');
      };
      box.append(label, run);
    }
    if (note) box.append(el('p', 'gl-muted', note));
  };
  box.append(el('p', 'gl-muted', '解析の状態を確認中…'));
  void ctx.api(path).then(async (response) => {
    show(response.ok ? parseVoiceAnalysis(await response.json().catch(() => null)) : null,
      response.ok ? '' : await errorText(response, '解析の状態を取得できませんでした'));
  }).catch(() => show(null, '解析の状態を取得できませんでした。'));
}
