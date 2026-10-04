// @implements SPEC-GLAB-LENDING-001
import { el, type PanelContext } from '../panel-kit.ts';
import { request, type Lookup } from './api.ts';

function field(title: string, input: HTMLElement): HTMLLabelElement {
  const label = el('label', 'gl-col');
  label.append(el('span', undefined, title), input);
  return label;
}

/** Lookup and confirmation are separate from the mutation to avoid accidental loans. */
export function borrowForm(ctx: PanelContext, onBorrowed: () => Promise<void>): {
  element: HTMLElement; selectEquipment(key: string): void;
} {
  const form = el('form', 'gl-col');
  const source = el('select', 'gl-select');
  source.append(new Option('本（ISBN）', 'book'), new Option('機材（QR番号）', 'equipment'));
  const key = el('input', 'gl-input'); key.required = true; key.maxLength = 200;
  const lookup = el('button', 'gl-btn', '内容を確認'); lookup.type = 'submit';
  const result = el('div', 'gl-col');
  const message = el('p'); message.setAttribute('role', 'status');
  let generation = 0;
  let busy = false;
  const reset = (): void => { generation++; result.replaceChildren(); message.textContent = ''; };
  source.onchange = reset; key.oninput = reset;
  form.append(el('h3', undefined, '借りる'), field('種類', source), field('ISBN・QR番号', key), lookup, message, result);
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    reset();
    const current = generation;
    const selectedSource = source.value;
    const selectedKey = key.value.trim();
    if (!selectedKey) return;
    lookup.disabled = true;
    try {
      const item = await request<Lookup>(ctx, '/lookup?' + new URLSearchParams({ source: selectedSource, key: selectedKey }));
      if (current !== generation) return;
      const canonicalKey = item.meta.isbn ?? item.meta.qrCode ?? selectedKey;
      const due = el('input', 'gl-input'); due.type = 'date';
      const note = el('input', 'gl-input'); note.maxLength = 1000;
      const borrow = el('button', 'gl-btn gl-btn-primary', 'この内容で借りる'); borrow.type = 'button';
      result.append(el('strong', undefined, item.meta.title ?? item.meta.name ?? canonicalKey),
        el('p', 'gl-muted', item.meta.author ?? item.meta.spec ?? ''),
        field('返却予定日（任意）', due), field('メモ（任意）', note), borrow);
      borrow.onclick = async () => {
        if (busy || current !== generation) return;
        busy = true; borrow.disabled = true; source.disabled = true; key.disabled = true; lookup.disabled = true;
        try {
          await request(ctx, '/loans', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source: selectedSource, external_key: canonicalKey, due_at: due.value || null, note: note.value.trim() || null }) });
          result.replaceChildren(); key.value = ''; generation++;
          message.textContent = '貸出を記録しました。';
          await onBorrowed();
        } catch (error) {
          message.textContent = error instanceof Error ? error.message : '貸出を確認できませんでした。自分の貸出状況を確認してから操作してください。';
        } finally { busy = false; borrow.disabled = false; source.disabled = false; key.disabled = false; lookup.disabled = false; }
      };
    } catch (error) {
      if (current === generation) message.textContent = error instanceof Error ? error.message : '本・機材を確認できませんでした。';
    } finally { if (!busy) lookup.disabled = false; }
  };
  return { element: form, selectEquipment(selectedKey) {
    if (busy) return;
    source.value = 'equipment'; key.value = selectedKey; reset(); form.requestSubmit(); form.scrollIntoView({ block: 'nearest' });
  } };
}
