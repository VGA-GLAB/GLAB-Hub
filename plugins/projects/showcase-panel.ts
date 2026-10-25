import { el, section, type PanelContext } from '../panel-kit.ts';
import { showcaseManagement } from './showcase-management-panel.ts';

interface Work {
  id: string; name: string; introduction: string; graduationYear: number | null;
  downloads: { name: string; size: number; downloadPath: string }[];
  authors: { userId: string; displayName: string }[];
}

export function showcaseSection(ctx: PanelContext, initialAuthor?: string): HTMLElement {
  const sec = section('🎮 作品ギャラリー');
  const filter = el('select', 'gl-select');
  filter.setAttribute('aria-label', '作品の卒業年度');
  const status = el('p', 'gl-muted', '読み込み中…');
  status.setAttribute('role', 'status');
  const cards = el('div');
  const clear = el('button', 'gl-btn ghost', '作者の絞り込みを解除');
  let selectedAuthor = initialAuthor;
  clear.hidden = !selectedAuthor;
  sec.body.append(el('p', 'gl-muted', '先輩の作品を遊んでみよう。在校生の制作作品も紹介しています。'), filter, clear, status, cards);

  function draw(works: Work[]): void {
    cards.replaceChildren();
    const shown = works.filter(work => (filter.value === 'all'
      || (filter.value === 'student' ? work.graduationYear === null : String(work.graduationYear) === filter.value))
      && (!selectedAuthor || work.authors.some(author => author.userId === selectedAuthor)));
    status.textContent = shown.length ? `${shown.length} 作品` : '公開中の作品はまだありません。';
    for (const work of shown) {
      const card = el('article', 'gl-notice');
      card.append(el('h3', undefined, work.name),
        el('p', 'gl-muted', work.graduationYear ? `${work.graduationYear} 年度卒業作品` : '在校生の作品'),
        el('p', undefined, work.introduction));
      const authors = el('div', 'gl-row');
      for (const author of work.authors) {
        const button = el('button', 'gl-btn ghost', `${author.displayName} の作品`);
        button.onclick = () => { selectedAuthor = author.userId; clear.hidden = false; draw(works); };
        authors.append(button);
      }
      card.append(authors);
      for (const download of work.downloads) {
        const link = el('button', 'gl-btn', `${download.name} (${(download.size / 1048576).toFixed(1)} MB)`);
        link.onclick = () => {
          link.disabled = true;
          void ctx.hubApi(download.downloadPath).then(async response => {
            if (!response.ok) throw new Error('Download failed');
            const url = URL.createObjectURL(await response.blob());
            const anchor = el('a'); anchor.href = url; anchor.download = download.name;
            document.body.append(anchor); anchor.click(); anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }).catch(() => { status.textContent = 'ダウンロードできませんでした。ログイン状態を確認してください。'; })
            .finally(() => { link.disabled = false; });
        };
        card.append(link);
      }
      cards.append(card);
    }
  }

  void ctx.hubApi('/api/x/projects/showcase/works').then(async response => {
    if (!response.ok) throw new Error('Works unavailable');
    const { works } = await response.json() as { works: Work[] };
    const options: [string, string][] = [['all', 'すべて'], ['student', '在校生'],
      ...[...new Set(works.flatMap(work => work.graduationYear === null ? [] : [work.graduationYear]))]
        .sort((a, b) => b - a).map((year): [string, string] => [String(year), `${year} 年度卒業`])];
    for (const [value, label] of options) {
      const option = el('option', undefined, label); option.value = value; filter.append(option);
    }
    filter.onchange = () => draw(works);
    clear.onclick = () => { selectedAuthor = undefined; clear.hidden = true; draw(works); };
    draw(works);
  }).catch(() => { status.textContent = '作品一覧を読み込めませんでした。再度開いてください。'; });
  if (ctx.identity.isAdmin && !initialAuthor) sec.body.append(showcaseManagement(ctx));
  return sec.wrap;
}
