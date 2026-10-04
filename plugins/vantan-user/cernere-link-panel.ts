import { el, type PanelContext } from '../panel-kit.ts';

/** @implements SPEC-GLAB-PERSONAL-DATA-001 */
export function cernereLinkSection(ctx: PanelContext): HTMLElement {
  const section = el('section', 'gl-notice');
  const message = el('p', 'gl-muted', 'リンクを読み込み中…');
  section.append(el('h3', undefined, 'Cernere'), message);
  void ctx.api('/cernere-link').then(async (response) => {
    const data = await response.json() as { url?: unknown };
    if (!response.ok || typeof data.url !== 'string') throw new Error('Link unavailable');
    const url = new URL(data.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Invalid link');
    }
    const link = el('a', 'gl-btn', 'Cernereを開く');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    message.remove();
    section.append(link);
  }).catch(() => { message.textContent = 'リンクを読み込めませんでした。'; });
  return section;
}
