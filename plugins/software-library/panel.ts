// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';
import { KIND_LABELS, PLATFORM_LABELS, type LibrarySummary } from './types.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  const root = el('section'); container.replaceChildren(root);
  root.append(el('h2', undefined, 'ライブラリ取得'),
    el('p', 'gl-muted', 'Cocoiru・GLabで使うライブラリの一覧です。Webでは閲覧のみ行えます。ダウンロードはCocoiruから行う予定です。現在、署名付き配布を準備しています。'));
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
  const cards = el('div');
  const refresh = el('button', 'gl-btn ghost', '更新');
  root.append(refresh, status, cards);
  let entries: LibrarySummary[] = [];
  let loaded = false;
  const draw = (): void => {
    if (!loaded) return;
    cards.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const shown = entries.filter(entry => entry.published && (!kind.value || entry.kind === kind.value)
      && (!platform.value || entry.platform === platform.value || entry.platform === 'any')
      && `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(query));
    status.textContent = shown.length ? `${shown.length} 件` : entries.some(entry => entry.published)
      ? '条件に合うライブラリはありません。条件を変えてみてください。' : '公開されているライブラリはありません。';
    for (const entry of shown) {
      const card = el('article', 'gl-notice');
      card.append(el('h3', undefined, entry.name), el('p', 'gl-muted', `${KIND_LABELS[entry.kind]} · ${PLATFORM_LABELS[entry.platform]} · ${entry.version}`),
        el('p', undefined, entry.description), el('p', 'gl-muted', `ライセンス：${entry.license}`));
      card.append(el('p', 'gl-muted', 'Cocoiru向けの署名付き配布を準備中です。'));
      cards.append(card);
    }
  };
  const load = async (): Promise<void> => {
    refresh.disabled = true; status.textContent = '読み込み中…';
    try {
      const response = await ctx.api('/entries');
      if (!response.ok) throw new Error('Catalog unavailable');
      const result = await response.json() as { entries: LibrarySummary[] };
      entries = result.entries; loaded = true; draw();
    } catch { cards.replaceChildren(); entries = []; loaded = false; status.textContent = '一覧を取得できませんでした。ログイン状態を確認して更新してください。'; }
    finally { refresh.disabled = false; }
  };
  search.oninput = draw; kind.onchange = draw; platform.onchange = draw;
  refresh.onclick = () => { void load(); };
  await load();
}
