/** Consent records only; no photo/template upload or inspection from GLAB.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import { el, type PanelContext } from '../panel-kit.ts';

interface Consent { facilityId: string; policyVersion: string; reconsentRequired: boolean }
export function faceConsentSection(ctx: PanelContext): HTMLElement {
  const section = el('section', 'gl-notice');
  section.append(el('h3', undefined, '顔認証への同意'), el('p', 'gl-muted', '顔写真と顔認証の登録は施設の受付で行ってください。ここでは同意の確認・撤回ができます。'));
  const status = el('p', 'gl-muted', '同意を確認しています…'), body = el('div');
  section.append(status, body);
  void render(ctx, status, body);
  return section;
}
async function render(ctx: PanelContext, status: HTMLElement, body: HTMLElement): Promise<void> {
  try {
    const [policyResponse, consentResponse] = await Promise.all([ctx.api('/face-consent/policy'), ctx.api('/face-consent/status')]);
    if (!policyResponse.ok || !consentResponse.ok) throw new Error('同意を確認できませんでした。');
    const policy = await policyResponse.json() as { version: string; text: string };
    const { items } = await consentResponse.json() as { items: Consent[] };
    body.replaceChildren(); status.textContent = items.length ? '施設ごとの同意' : '有効な同意はありません。';
    for (const item of items) {
      const row = el('div', 'gl-row'), revoke = el('button', 'gl-btn', 'この施設の同意を撤回');
      row.append(el('span', undefined, `${item.facilityId}${item.reconsentRequired ? '（再同意が必要です）' : ''}`), revoke);
      revoke.onclick = () => {
        revoke.disabled = true;
        void ctx.api(`/face-consent?facilityId=${encodeURIComponent(item.facilityId)}`, { method: 'DELETE' }).then(async response => {
          if (!response.ok) throw new Error('撤回結果を確認できませんでした。再読み込みして状態を確認してください。');
          await render(ctx, status, body);
        }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : '撤回結果を確認できませんでした。'; });
      };
      body.append(row);
    }
    body.append(el('p', 'gl-muted', policy.text));
  } catch (error) { status.textContent = error instanceof Error ? error.message : '同意を確認できませんでした。'; }
}
