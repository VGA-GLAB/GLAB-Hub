import type { PanelContext } from '../../corpus/public/src/types.ts';
import { steamProfileFields } from './steam-profile-form.ts';

export function steamProfileSection(ctx: PanelContext): HTMLElement {
  const form = document.createElement('form');
  form.className = 'gl-notice gl-profile-gate gl-profile-form';
  const fields = steamProfileFields(ctx);
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'gl-btn';
  submit.textContent = 'Steam設定を保存';
  form.append(fields.element, message, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    const profile = fields.read();
    if (!profile) {
      message.textContent = 'Steam設定の読み込み後に保存してください。';
      return;
    }
    submit.disabled = true;
    message.textContent = '保存中…';
    void ctx.hubApi('/api/x/vantan-user/steam-profile', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profile),
    }).then((response) => {
      if (!response.ok) throw new Error('Save failed');
      message.textContent = 'Steam設定を保存しました。';
    }).catch(() => {
      message.textContent = '保存できませんでした。入力内容を確認して再試行してください。';
    }).finally(() => { submit.disabled = false; });
  };
  return form;
}
