import { el, type PanelContext } from '../panel-kit.ts';

/** 管理者が確認済み証跡と読取時 revision を指定する所有者変更フォーム。 */
export function ownerEditor(
  job: { id: number; ownerUserId: string | null; ownerRevision: number },
  ctx: PanelContext, rerender: () => Promise<void>,
): HTMLElement {
  const form = el('details');
  form.appendChild(el('summary', undefined, '所有者を確認・変更する'));
  const userId = el('input', 'gl-input') as HTMLInputElement;
  userId.placeholder = '確認済み Cernere user ID';
  userId.value = job.ownerUserId ?? '';
  const evidence = el('input', 'gl-input') as HTMLInputElement;
  evidence.placeholder = '本人照合済みの証跡参照（表示名だけで判断しない）';
  const save = el('button', 'gl-btn', '確認済み所有者を保存');
  const message = el('p', 'gl-muted');
  let operationId = crypto.randomUUID();
  let submittedBody = '';
  save.onclick = async () => {
    if (!userId.value.trim() || !evidence.value.trim()) {
      message.textContent = '本人IDと確認証跡を入力してください。';
      return;
    }
    const input = {
      expectedOwner: job.ownerUserId, expectedRevision: job.ownerRevision,
      ownerUserId: userId.value.trim(), evidenceKind: 'admin_verified', evidenceRef: evidence.value.trim(),
    };
    const signature = JSON.stringify(input);
    if (submittedBody && submittedBody !== signature) operationId = crypto.randomUUID();
    submittedBody = signature;
    save.setAttribute('disabled', 'true');
    try {
      const response = await ctx.api(`/${job.id}/owner`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, operationId }),
      });
      if (response.ok) await rerender();
      else message.textContent = `保存できませんでした (${response.status})。競合時は一覧を更新して再確認してください。`;
    } catch {
      message.textContent = '通信に失敗しました。同じ入力で再送できます。';
    } finally {
      save.removeAttribute('disabled');
    }
  };
  form.append(userId, evidence, save, message);
  return form;
}
