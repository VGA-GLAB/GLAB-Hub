import { el, type PanelContext } from '../panel-kit.ts';
import { request } from './api.ts';

interface BudgetItem {
  id: string; fiscalYear: number; label: string; allocatedYen: number; spentYen: number;
}
const yen = (value: number): string => value.toLocaleString('ja-JP') + '円';

/** @implements SPEC-GLAB-BUDGET-001 */
export async function mountBudget(container: HTMLElement, ctx: PanelContext): Promise<void> {
  const title = el('h3', undefined, '部の予算');
  container.replaceChildren(title, el('p', 'gl-muted', '読み込み中…'));
  try {
    const data = await request<{ items: BudgetItem[]; canEdit: boolean }>(ctx, '/budget');
    container.replaceChildren(title);
    if (!data.items.length) container.append(el('p', 'gl-muted', '予算は未登録です。'));
    const form = el('form', 'gl-col');
    let editingId: BudgetItem['id'] = crypto.randomUUID();
    const year = el('input', 'gl-input'); year.type = 'number'; year.min = '2000'; year.max = '2100';
    year.value = String(new Date().getFullYear());
    const label = el('input', 'gl-input'); label.maxLength = 120;
    const allocated = el('input', 'gl-input'); allocated.type = 'number';
    const spent = el('input', 'gl-input'); spent.type = 'number';
    for (const input of [allocated, spent]) { input.min = '0'; input.max = '1000000000'; input.step = '1'; }
    for (const [caption, input] of [['年度', year], ['項目名', label],
      ['予算（円）', allocated], ['使用額（円）', spent]] as const) {
      input.required = true;
      const field = el('label', 'gl-col'); field.append(el('span', undefined, caption), input); form.append(field);
    }
    for (const item of data.items) {
      const card = el('article', 'gl-card');
      card.append(el('strong', undefined, `${item.fiscalYear}年度 · ${item.label}`),
        el('p', undefined, `予算 ${yen(item.allocatedYen)} ／ 使用 ${yen(item.spentYen)} ／ 残り ${yen(item.allocatedYen - item.spentYen)}`));
      if (data.canEdit) {
        const edit = el('button', 'gl-btn', '編集');
        edit.onclick = () => {
          editingId = item.id; year.value = String(item.fiscalYear); label.value = item.label;
          allocated.value = String(item.allocatedYen); spent.value = String(item.spentYen);
          form.scrollIntoView({ block: 'nearest' });
        };
        card.append(edit);
      }
      container.append(card);
    }
    if (data.canEdit) {
      const save = el('button', 'gl-btn', '予算を保存'); save.type = 'submit';
      const fresh = el('button', 'gl-btn', '新しい項目'); fresh.type = 'button';
      fresh.onclick = () => { editingId = crypto.randomUUID(); label.value = ''; allocated.value = ''; spent.value = ''; };
      const message = el('p'); message.setAttribute('role', 'status');
      form.append(save, fresh, message); container.append(form);
      form.onsubmit = async event => {
        event.preventDefault();
        save.disabled = true; fresh.disabled = true;
        try {
          await request(ctx, '/budget', { method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: editingId, fiscalYear: Number(year.value), label: label.value,
              allocatedYen: Number(allocated.value), spentYen: Number(spent.value) }) });
          await mountBudget(container, ctx);
        } catch (error) { message.textContent = error instanceof Error ? error.message : '保存できませんでした。'; }
        finally { save.disabled = false; fresh.disabled = false; }
      };
    }
  } catch (error) {
    const retry = el('button', 'gl-btn', '再読み込み'); retry.onclick = () => void mountBudget(container, ctx);
    container.replaceChildren(title, el('p', 'gl-muted', error instanceof Error ? error.message : '予算を読み込めませんでした。'), retry);
  }
}
