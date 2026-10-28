// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';
import { distributionUrl } from './distribution-url.ts';
import { management } from './management.ts';
import { KIND_LABELS, PLATFORM_LABELS, type LibraryEntry } from './types.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  const root = el('section'); container.replaceChildren(root);
  root.append(el('h2', undefined, 'ライブラリ取得'),
    el('p', 'gl-muted', 'Cocoiru・GLabで使う追加機能や、制作に必要なライブラリを探せます。対応OSと用途を確認して取得先へ進んでください。'));
  const search = el('input', 'gl-input'); search.type = 'search'; search.placeholder = '名前・用途で探す'; search.setAttribute('aria-label', 'ライブラリを検索');
  const choice = (label: string, values: Record<string, string>): HTMLSelectElement => {
    const select = el('select', 'gl-select'); select.setAttribute('aria-label', label);
    const all = el('option', undefined, `${label}：すべて`); all.value = ''; select.append(all);
    for (const [value, text] of Object.entries(values)) { const option = el('option', undefined, text); option.value = value; select.append(option); }
    return select;
  };
  const kind = choice('種類', KIND_LABELS), platform = choice('対応OS', PLATFORM_LABELS);
  const filters = el('div', 'gl-row'); filters.append(search, kind, platform); root.append(filters);
  const status = el('p', 'gl-muted', '読み込み中…'); status.setAttribute('role', 'status');
  const cards = el('div'), admin = el('div');
  const refresh = el('button', 'gl-btn ghost', '更新');
  root.append(refresh, status, cards, admin);
  let entries: LibraryEntry[] = [];
  let loaded = false;
  const draw = (): void => {
    if (!loaded) return;
    cards.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const shown = entries.filter(entry => entry.published && (!kind.value || entry.kind === kind.value)
      && (!platform.value || entry.platform === platform.value || entry.platform === 'any')
      && `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(query));
    status.textContent = shown.length ? `${shown.length} 件` : entries.some(entry => entry.published)
      ? '条件に合うライブラリはありません。条件を変えてみてください。' : '配布情報は準備中です。公開されるとここから取得できます。';
    for (const entry of shown) {
      const card = el('article', 'gl-notice');
      card.append(el('h3', undefined, entry.name), el('p', 'gl-muted', `${KIND_LABELS[entry.kind]} · ${PLATFORM_LABELS[entry.platform]} · ${entry.version}`),
        el('p', undefined, entry.description), el('p', 'gl-muted', `ライセンス：${entry.license}`));
      const url = distributionUrl(entry.downloadUrl);
      if (url) {
        const link = el('a', 'gl-btn', '取得先を開く'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        card.append(link, el('p', 'gl-muted', `配布先：${new URL(url).hostname}（別のタブで開きます）`));
      } else card.append(el('p', 'error', '取得先を確認中です。管理者へお知らせください。'));
      if (entry.sha256) { const hash = el('code', undefined, `配布元の SHA-256: ${entry.sha256}`); hash.style.overflowWrap = 'anywhere'; card.append(hash); }
      cards.append(card);
    }
  };
  const load = async (): Promise<void> => {
    refresh.disabled = true; status.textContent = '読み込み中…';
    try {
      const response = await ctx.api(ctx.identity.isAdmin ? '/manage' : '/entries');
      if (!response.ok) throw new Error('Catalog unavailable');
      const result = await response.json() as { entries: LibraryEntry[] };
      entries = result.entries; loaded = true; draw();
      admin.replaceChildren();
      if (ctx.identity.isAdmin) admin.append(management(ctx, entries, load));
    } catch { cards.replaceChildren(); admin.replaceChildren(); entries = []; loaded = false; status.textContent = '一覧を取得できませんでした。ログイン状態を確認して更新してください。'; }
    finally { refresh.disabled = false; }
  };
  search.oninput = draw; kind.onchange = draw; platform.onchange = draw;
  refresh.onclick = () => { void load(); };
  await load();
}
