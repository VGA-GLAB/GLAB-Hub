import { el, section, type PanelContext } from '../panel-kit.ts';
import { requestFacilityProof } from './automatic-proof-request.ts';

interface Target { facilityId: string; lanId: string; name: string; url: string; challenge: string }

/** Owns concurrent browser-to-LAN requests and cancels them when the view disappears. */
export async function automaticFacilitySection(ctx: PanelContext): Promise<HTMLElement> {
  const view = section('施設への到着確認');
  const controller = new AbortController();
  let attached = false;
  const observer = new MutationObserver(() => {
    if (view.wrap.isConnected) attached = true;
    else if (attached) { controller.abort(); observer.disconnect(); }
  });
  const dispose = () => { controller.abort(); observer.disconnect(); };
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', dispose, { once: true });
  const status = el('p', 'gl-muted', '所属組織の施設を確認しています…');
  view.body.append(status);
  // Return immediately so the owner can mount the view before network completion.
  void (async () => {
    try {
      const response = await ctx.api('/automatic/targets', { method: 'POST', signal: controller.signal });
      if (!response.ok) throw new Error('施設の一覧を取得できませんでした。');
      const body = await response.json() as { configured: boolean; targets: Target[] };
      if (controller.signal.aborted) return;
      status.textContent = !body.configured ? '施設の自動確認は未設定です。'
        : body.targets.length ? '施設への到着を自動確認します。イベントの出席は主催者の承認後に確定します。' : '所属組織の確認対象施設はありません。';
      const saves: Promise<void>[] = [];
      // Batches bound concurrent LAN requests; challenges are refreshed by reopening the tab.
      for (let offset = 0; offset < body.targets.length && !controller.signal.aborted; offset += 8) {
        await Promise.all(body.targets.slice(offset, offset + 8).map(async target => {
          const label = el('p', undefined, `${target.name}：確認中…`);
          view.body.append(label);
          const proof = await requestFacilityProof(target.url, target.challenge, controller.signal);
          if (proof.kind === 'cancelled' || controller.signal.aborted) return;
          if (proof.kind !== 'proof') {
            label.textContent = target.name + (proof.kind === 'outside-lan' ? '：LAN外（接続できません）' : '：本人・施設の確認に失敗しました。');
            return;
          }
          label.textContent = `${target.name}：到着を保存しています…`;
          // Ledger latency must not prevent the next batch from checking its LAN gateways.
          saves.push((async () => { try {
            const saved = await ctx.api('/automatic/checkin', {
              method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
              body: JSON.stringify({ attestation: proof.attestation }),
            });
            const result = await saved.json() as { ok?: boolean; alreadyCheckedIn?: boolean };
            if (!controller.signal.aborted) label.textContent = `${target.name}：${saved.ok && result.ok === true
              ? result.alreadyCheckedIn ? '本日は到着確認済みです。' : '到着を記録しました。'
              : '到着を保存できませんでした。'}`;
          } catch { if (!controller.signal.aborted) label.textContent = `${target.name}：到着を保存できませんでした。`; } })());
        }));
      }
      await Promise.all(saves);
    } catch { if (!controller.signal.aborted) status.textContent = '施設の確認を開始できませんでした。'; }
    finally { observer.disconnect(); window.removeEventListener('pagehide', dispose); }
  })();
  return view.wrap;
}
