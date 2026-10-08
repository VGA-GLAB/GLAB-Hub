import { el } from '../panel-kit.ts';
import { MAX_COMMENT_LENGTH, MAX_TELOP_LENGTH, validateReactionText, type SubmissionCategory } from './viewer-protocol.ts';

export interface ReactionSender {
  telop(text: string): boolean;
  submission(text: string, category: SubmissionCategory, showOnScreen: boolean): boolean;
}

/** Sender intent is explicit; no legacy comment fallback may publish a private draft. */
export function reactionComposer(sender: ReactionSender): { element: HTMLElement; setReady(ready: boolean): void } {
  const element = el('div', 'od-composer');
  const availability = el('p', 'gl-muted');
  const feedback = el('p', 'od-notice');
  feedback.setAttribute('role', 'status');
  const fields = el('fieldset', 'od-composer-fields');
  const telopForm = el('form', 'od-text-form');
  const telopLabel = el('label', undefined, 'ツッコミテロップ（全員の画面に5秒間表示）');
  const telopInput = el('input', 'gl-input');
  telopInput.maxLength = MAX_TELOP_LENGTH * 2;
  telopInput.placeholder = `${MAX_TELOP_LENGTH}文字まで`;
  telopLabel.append(telopInput);
  const telopSend = el('button', 'gl-btn', 'ツッコミを送る');
  telopSend.type = 'submit';
  telopForm.append(telopLabel, telopSend);
  telopForm.onsubmit = (event) => {
    event.preventDefault();
    const text = validateReactionText(telopInput.value, MAX_TELOP_LENGTH);
    if (!text) { feedback.textContent = `1〜${MAX_TELOP_LENGTH}文字で入力してください`; return; }
    if (!sender.telop(text)) { feedback.textContent = '送信できません。接続状態を確認してください'; return; }
    telopInput.value = '';
    feedback.textContent = 'ツッコミを送信しました';
  };
  const postForm = el('form', 'od-text-form');
  const categoryLabel = el('label', undefined, '投稿の種類');
  const category = el('select', 'gl-input');
  for (const [value, label] of [['question', '質問'], ['impression', '感想']] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    category.append(option);
  }
  categoryLabel.append(category);
  const textLabel = el('label', undefined, '質問・感想');
  const textInput = el('textarea', 'gl-input');
  textInput.rows = 3;
  textInput.maxLength = MAX_COMMENT_LENGTH * 2;
  textInput.placeholder = `${MAX_COMMENT_LENGTH}文字まで`;
  textLabel.append(textInput);
  const visibilityLabel = el('label', 'od-visibility');
  const visibility = el('input');
  visibility.type = 'checkbox';
  visibility.checked = false;
  visibilityLabel.append(visibility, ' 名前と本文をみんなの画面にも表示する');
  const policy = el('p', 'gl-muted', 'オフの場合は配信者の受信箱だけに届きます。');
  const postSend = el('button', 'gl-btn', '質問・感想を送る');
  postSend.type = 'submit';
  postForm.append(categoryLabel, textLabel, visibilityLabel, policy, postSend);
  postForm.onsubmit = (event) => {
    event.preventDefault();
    const text = validateReactionText(textInput.value, MAX_COMMENT_LENGTH);
    if (!text) { feedback.textContent = `1〜${MAX_COMMENT_LENGTH}文字で入力してください`; return; }
    const kind: SubmissionCategory = category.value === 'impression' ? 'impression' : 'question';
    if (!sender.submission(text, kind, visibility.checked)) { feedback.textContent = '送信できません。接続状態を確認してください'; return; }
    textInput.value = '';
    feedback.textContent = visibility.checked ? '画面表示を選んで送信しました' : '画面に出さない投稿を送信しました';
    visibility.checked = false; // Consent is per post, not a sticky publication preference.
  };
  fields.append(telopForm, postForm);
  element.append(availability, fields, feedback);
  const setReady = (ready: boolean): void => {
    fields.disabled = !ready;
    availability.textContent = ready ? '映像を止めずに送れます。文字の投稿は3秒以上あけてください。' : 'テキスト投稿に対応した配信者の接続を待っています';
  };
  setReady(false);
  return { element, setReady };
}
