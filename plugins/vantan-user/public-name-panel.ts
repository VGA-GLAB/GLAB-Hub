import { el, type PanelContext } from '../panel-kit.ts';

/** @implements SPEC-GLAB-PROFILE-EDIT-001 */
export function publicNameSection(ctx: PanelContext): HTMLElement {
  const form = el('form', 'gl-notice gl-profile-form');
  const label = el('label', 'gl-profile-field', '公開名');
  const name = el('input', 'gl-input');
  name.required = true;
  name.maxLength = 200;
  name.setAttribute('autocomplete', 'nickname');
  name.disabled = true;
  label.append(name);
  const message = el('p', 'gl-muted', '読み込み中…');
  message.setAttribute('role', 'status');
  const save = el('button', 'gl-btn', '公開名を保存');
  save.type = 'submit';
  save.disabled = true;
  const retry = el('button', 'gl-btn ghost', '再読み込み');
  retry.type = 'button';
  retry.hidden = true;
  form.append(el('h3', undefined, '公開名'), label, message, save, retry);
  const load = async (): Promise<void> => {
    retry.hidden = true;
    try {
      const response = await ctx.api('/public-name', { cache: 'no-store' });
      const data = await response.json() as { publicName?: unknown };
      if (!response.ok || typeof data.publicName !== 'string') throw new Error('Read failed');
      name.value = data.publicName;
      name.disabled = false;
      save.disabled = false;
      message.textContent = '';
    } catch {
      message.textContent = '公開名を読み込めませんでした。';
      retry.hidden = false;
    }
  };
  retry.onclick = () => { void load(); };
  form.onsubmit = (event) => {
    event.preventDefault();
    const publicName = name.value.trim();
    if (!publicName) { message.textContent = '公開名を入力してください。'; return; }
    save.disabled = true;
    name.disabled = true;
    message.textContent = '保存中…';
    void ctx.api('/public-name', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publicName }) }).then((response) => {
      if (!response.ok) throw new Error('Save failed');
      name.value = publicName;
      message.textContent = '公開名を保存しました。';
      document.dispatchEvent(new CustomEvent('glab:public-name', { detail: publicName }));
    }).catch(() => { message.textContent = '保存できませんでした。もう一度お試しください。'; })
      .finally(() => { save.disabled = false; name.disabled = false; });
  };
  void load();
  return form;
}
