import { el, type PanelContext } from '../panel-kit.ts';

interface Project { project_id: string; name: string; introduction: string; graduation_year: number | null; published: number }

export function showcaseManagement(ctx: PanelContext): HTMLElement {
  const details = el('details');
  details.append(el('summary', undefined, '作品の掲載設定（管理者）'));
  details.append(el('p', 'gl-muted', 'プロジェクトを登録し、配布する Windows exe（64 MB 以下）をアップロードしてから掲載してください。'));
  const message = el('p'); message.setAttribute('role', 'status'); details.append(message);
  void ctx.hubApi('/api/x/projects/showcase/manage').then(async response => {
    if (!response.ok) throw new Error('Settings unavailable');
    const { projects } = await response.json() as { projects: Project[] };
    for (const project of projects) details.append(projectForm(project, ctx));
  }).catch(() => { message.textContent = '掲載設定を取得できませんでした。'; });
  return details;
}

function projectForm(project: Project, ctx: PanelContext): HTMLElement {
  const form = el('form', 'gl-notice');
  const intro = el('textarea', 'gl-textarea'); intro.value = project.introduction;
  intro.maxLength = 2000; intro.setAttribute('aria-label', `${project.name} の作品紹介`);
  const year = el('input', 'gl-input'); year.type = 'number'; year.min = '2000'; year.max = '2100';
  year.placeholder = '卒業年度（在校生は空欄）'; year.value = project.graduation_year?.toString() ?? '';
  year.setAttribute('aria-label', `${project.name} の卒業年度`);
  const label = el('label'); const published = el('input'); published.type = 'checkbox'; published.checked = project.published === 1;
  label.append(published, '作品一覧に掲載');
  const save = el('button', 'gl-btn', '掲載設定を保存'); save.type = 'submit';
  const message = el('p'); message.setAttribute('role', 'status');
  const file = el('input'); file.type = 'file'; file.accept = '.exe'; file.setAttribute('aria-label', `${project.name} の exe`);
  const upload = el('button', 'gl-btn ghost', 'exe をアップロード'); upload.type = 'button';
  upload.onclick = () => {
    const selected = file.files?.[0];
    if (!selected || selected.size > 64 * 1024 * 1024) { message.textContent = '64 MB 以下の exe を選択してください。'; return; }
    upload.disabled = true;
    void ctx.hubApi(`/api/x/projects/showcase/executable/${encodeURIComponent(project.project_id)}?name=${encodeURIComponent(selected.name)}`, {
      method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: selected,
    }).then(response => { message.textContent = response.ok ? 'exe を保存しました。掲載設定を保存すると公開されます。' : '保存できませんでした。Windows exe の形式とサイズを確認してください。'; })
      .catch(() => { message.textContent = 'アップロードに失敗しました。'; }).finally(() => { upload.disabled = false; });
  };
  form.append(el('h4', undefined, project.name), intro, year, file, upload, label, save, message);
  form.onsubmit = event => {
    event.preventDefault(); save.disabled = true;
    void ctx.hubApi(`/api/x/projects/showcase/manage/${encodeURIComponent(project.project_id)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ introduction: intro.value, graduationYear: year.value ? Number(year.value) : null, published: published.checked }),
    }).then(async response => {
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        message.textContent = body.error === 'exe_required' ? '公開できる exe がありません。先にアップロードしてください。' : '保存できませんでした。';
        return;
      }
      message.textContent = '保存しました。一覧の更新で反映されます。';
    }).catch(() => { message.textContent = '通信に失敗しました。'; }).finally(() => { save.disabled = false; });
  };
  return form;
}
