// @implements SPEC-GLAB-LENDING-001
import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';
import { request, type Equipment, type Loan } from './api.ts';
import { borrowForm } from './borrow-form.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  container.replaceChildren(el('h2', undefined, '本・機材'));
  const equipment = el('section', 'gl-col');
  const loans = el('section', 'gl-col');
  const history = el('input'); history.type = 'checkbox';
  const historyLabel = el('label'); historyLabel.append(history, document.createTextNode(' 返却済みも表示'));
  let loansGeneration = 0;
  async function loadLoans(): Promise<void> {
    const current = ++loansGeneration;
    loans.replaceChildren(el('p', 'gl-muted', '読み込み中…'));
    try {
      const data = await request<{ items: Loan[] }>(ctx, '/loans/mine' + (history.checked ? '?all=1' : ''));
      if (current !== loansGeneration) return;
      loans.replaceChildren();
      if (!data.items.length) loans.append(el('p', 'gl-muted', '貸出はありません。'));
      for (const loan of data.items) {
        const card = el('article', 'gl-card');
        card.append(el('strong', undefined, loan.label ?? loan.external_key),
          el('p', undefined, loan.returned_at ? '返却済み' : '貸出中'),
          el('p', 'gl-muted', '貸出日：' + loan.borrowed_at.slice(0, 10)),
          el('p', 'gl-muted', '返却予定日：' + (loan.due_at?.slice(0, 10) ?? '未指定')));
        loans.append(card);
      }
    } catch (error) {
      if (current === loansGeneration) loans.replaceChildren(el('p', 'gl-muted', error instanceof Error ? error.message : '貸出を読み込めませんでした。'));
    }
  }
  history.onchange = () => void loadLoans();
  const borrow = borrowForm(ctx, loadLoans);
  const refresh = el('button', 'gl-btn', '貸出状況を再読み込み'); refresh.onclick = () => void loadLoans();
  container.append(borrow.element, el('h3', undefined, '自分の貸出'), historyLabel, refresh, loans,
    el('p', 'gl-muted', '返却する際は担当者に本・機材を渡してください。'), el('h3', undefined, '機材一覧'), equipment);
  async function loadEquipment(): Promise<void> {
    equipment.replaceChildren(el('p', 'gl-muted', '読み込み中…'));
    try {
      const data = await request<{ items: Equipment[] }>(ctx, '/equipment');
      equipment.replaceChildren();
      if (!data.items.length) equipment.append(el('p', 'gl-muted', '登録されている機材はありません。'));
      for (const item of data.items) {
        const card = el('article', 'gl-card');
        const button = el('button', 'gl-btn', 'この機材を選ぶ'); button.onclick = () => borrow.selectEquipment(item.qr_code);
        card.append(el('strong', undefined, item.name), el('p', 'gl-muted', item.spec ?? item.qr_code), button);
        equipment.append(card);
      }
    } catch (error) {
      const retry = el('button', 'gl-btn', '再読み込み'); retry.onclick = () => void loadEquipment();
      equipment.replaceChildren(el('p', 'gl-muted', error instanceof Error ? error.message : '機材を読み込めませんでした。'), retry);
    }
  }
  await Promise.all([loadLoans(), loadEquipment()]);
}
