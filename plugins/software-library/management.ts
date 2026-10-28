// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import { el, type PanelContext } from '../panel-kit.ts';
import { KIND_LABELS, PLATFORM_LABELS, type LibraryEntry } from './types.ts';

export function management(ctx: PanelContext, entries: LibraryEntry[], reload: () => Promise<void>): HTMLElement {
  const details = el('details'); details.append(el('summary', undefined, '配布情報を管理'));
  const form = el('form', 'gl-section');
  const select = el('select', 'gl-select');
  select.setAttribute('aria-label', '編集するライブラリ');
  const first = el('option', undefined, '新しく登録'); first.value = ''; select.append(first);
  for (const entry of entries) {
    const option = el('option', undefined, `${entry.name} ${entry.version}（${entry.published ? '公開中' : '下書き'}）`);
    option.value = entry.id; select.append(option);
  }
  form.append(select);
  const field = (label: string, maxLength: number): HTMLInputElement => {
    const wrap = el('label', 'gl-col', label), input = el('input', 'gl-input');
    input.maxLength = maxLength; wrap.append(input); form.append(wrap); return input;
  };
  const id = field('管理用 ID（半角英数字とハイフン）', 80);
  id.required = true; id.pattern = '[a-z0-9][a-z0-9-]{0,79}';
  const name = field('名前', 120); name.required = true;
  const descriptionLabel = el('label', 'gl-col', '用途・使い方');
  const description = el('textarea', 'gl-input'); description.maxLength = 2000; description.required = true;
  descriptionLabel.append(description); form.append(descriptionLabel);
  const choices = (label: string, values: Record<string, string>): HTMLSelectElement => {
    const wrap = el('label', 'gl-col', label), input = el('select', 'gl-select');
    for (const [value, text] of Object.entries(values)) { const option = el('option', undefined, text); option.value = value; input.append(option); }
    wrap.append(input); form.append(wrap); return input;
  };
  const kind = choices('種類', KIND_LABELS), platform = choices('対応 OS', PLATFORM_LABELS);
  const version = field('バージョン', 80), license = field('ライセンス', 200);
  const url = field('公開用の取得先 URL（HTTPS）', 2000); url.type = 'url';
  const sha256 = field('配布元の SHA-256（任意）', 64); sha256.pattern = '[a-fA-F0-9]{64}|';
  const publishedLabel = el('label', 'gl-row', '利用者に公開する');
  const published = el('input'); published.type = 'checkbox'; publishedLabel.prepend(published); form.append(publishedLabel);
  const status = el('p', 'gl-muted'); status.setAttribute('role', 'status');
  const save = el('button', 'gl-btn', '保存'); save.type = 'submit';
  form.append(el('p', 'gl-muted', '取得先には、ログイン情報や期限付きの認証情報を含まない公開用リンクを登録してください。'), save, status);
  select.onchange = () => {
    const entry = entries.find(item => item.id === select.value);
    id.value = entry?.id ?? ''; id.readOnly = !!entry;
    name.value = entry?.name ?? ''; description.value = entry?.description ?? '';
    kind.value = entry?.kind ?? 'runtime'; platform.value = entry?.platform ?? 'windows';
    version.value = entry?.version ?? ''; license.value = entry?.license ?? '';
    url.value = entry?.downloadUrl ?? ''; sha256.value = entry?.sha256 ?? ''; published.checked = entry?.published ?? false;
    status.textContent = '';
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true; status.textContent = '保存しています…';
    void ctx.api(`/entries/${encodeURIComponent(id.value)}`, { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.value, description: description.value, kind: kind.value, platform: platform.value,
        version: version.value, license: license.value, downloadUrl: url.value, sha256: sha256.value, published: published.checked }) })
      .then(async response => {
        if (!response.ok) {
          const failure = await response.json().catch(() => ({})) as { message?: string };
          status.textContent = failure.message ?? '保存できませんでした。入力内容と権限を確認してください。'; return;
        }
        status.textContent = '保存しました。'; await reload();
      }).catch(() => { status.textContent = '保存できませんでした。接続を確認してください。'; })
      .finally(() => { save.disabled = false; });
  };
  details.append(form); return details;
}
