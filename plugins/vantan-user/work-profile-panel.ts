import { el, section, type PanelContext } from '../panel-kit.ts';
import { showcaseSection } from '../projects/showcase-panel.ts';

export function workProfileSection(ctx: PanelContext): HTMLElement {
  const sec = section('自分の作品を紹介する');
  sec.body.append(el('p', 'gl-muted', '参加した作品をプロフィールに掲載できます。作品カードに表示名と自分の作品一覧へのリンクが表示されます。'));
  const status = el('p'); status.setAttribute('role', 'status'); sec.body.append(status);
  void ctx.hubApi('/api/x/projects/showcase/mine').then(async response => {
    if (!response.ok) throw new Error('Profile works unavailable');
    const { works } = await response.json() as { works: { id: string; name: string; published: boolean; featured: boolean }[] };
    if (!works.length) status.textContent = '制作メンバーに登録された作品はまだありません。';
    for (const work of works) {
      const row = el('label', 'gl-row'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = work.featured;
      row.append(checkbox, `${work.name}${work.published ? '' : '（作品一覧への掲載待ち）'}`);
      checkbox.onchange = () => {
        const featured = checkbox.checked; checkbox.disabled = true;
        void ctx.hubApi(`/api/x/projects/showcase/mine/${encodeURIComponent(work.id)}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ featured }),
        }).then(response => {
          if (!response.ok) throw new Error('Save failed');
          status.textContent = 'プロフィールへの掲載設定を保存しました。';
        }).catch(() => { checkbox.checked = !featured; status.textContent = '保存できませんでした。'; })
          .finally(() => { checkbox.disabled = false; });
      };
      sec.body.append(row);
    }
  }).catch(() => { status.textContent = '作品情報を読み込めませんでした。'; });
  const preview = el('button', 'gl-btn ghost', '自分の作品一覧を見る');
  const view = el('div');
  preview.onclick = () => view.replaceChildren(showcaseSection(ctx, ctx.identity.userId));
  sec.body.append(preview, view);
  return sec.wrap;
}
