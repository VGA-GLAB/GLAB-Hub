/**
 * 出席一覧の GPS 行から写真を開く。 一覧を開いた時点では取りに行かず、 押した 1 件だけ
 * 認証付きの API で取得して object URL で表示する (直リンクを画面に出さない)。
 */

import { el, type PanelContext } from '../panel-kit.ts';

export function appendGpsPhoto(item: HTMLElement, ctx: PanelContext, attendanceId: string): void {
  const slot = el('span', 'gl-tag', '出席写真');
  slot.onclick = () => {
    slot.onclick = null;
    slot.textContent = '取得中…';
    void ctx.api(`/gps-photos/${encodeURIComponent(attendanceId)}`)
      .then(async (response) => {
        if (!response.ok) { slot.textContent = '写真を取得できません'; return; }
        const url = URL.createObjectURL(await response.blob());
        const release = () => URL.revokeObjectURL(url);
        const image = el('img', 'gl-face-photo');
        image.onload = release;
        image.onerror = release;
        image.src = url;
        image.alt = '出席時の写真';
        image.width = 160;
        slot.replaceWith(image);
      })
      .catch(() => { slot.textContent = '写真を取得できません'; });
  };
  item.append(slot);
}
