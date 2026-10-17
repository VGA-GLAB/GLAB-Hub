import { el, type PanelContext } from '../panel-kit.ts';

export function programControls(ctx: PanelContext, sessionId: string, operator: boolean): HTMLElement {
  const box = el('div', 'gl-row');
  const project = el('select');
  project.setAttribute('aria-label', 'Project GLab');
  const slot = el('select');
  slot.setAttribute('aria-label', '配信入力');
  for (let i = 1; i <= 4; i++) {
    const option = el('option', '', `入力 ${i}`); option.value = `input${i}`; slot.appendChild(option);
  }
  const message = el('span', 'gl-muted');
  const links = el('span');
  const source = el('button', 'gl-btn ghost', '画面を送る'); source.type = 'button';
  const producer = el('button', 'gl-btn', '番組を制作'); producer.type = 'button'; producer.disabled = true;
  async function launch(role: 'producer' | 'presenter'): Promise<void> {
    producer.disabled = true; source.disabled = true; links.replaceChildren();
    message.textContent = '接続を準備中…';
    try {
      const response = await ctx.hubApi(`/api/x/odeum/sessions/${encodeURIComponent(sessionId)}/program-ticket`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(role === 'producer' ? { role, projectId: project.value } : { role, slot: slot.value }),
      });
      if (!response.ok) {
        const error = await response.json() as { error?: string };
        message.textContent = error.error === 'program_not_configured' ? '先に運営者がプロジェクトを選び、番組を制作してください。' :
          error.error === 'program_project_conflict' ? 'この番組は別のプロジェクトに登録済みです。' :
          response.status === 403 ? 'この番組に接続する権限がありません。' : '接続を準備できませんでした。';
        return;
      }
      const result = await response.json() as { launchUrl: string };
      if (role === 'producer') {
        // The existing OS scheme belongs to presenter; program accepts a pasted launch link.
        const field = el('input'); field.readOnly = true; field.value = result.launchUrl;
        field.setAttribute('aria-label', '番組リンク');
        field.onclick = () => field.select();
        const copy = el('button', 'gl-btn', '番組リンクをコピー'); copy.type = 'button';
        copy.onclick = () => {
          void navigator.clipboard.writeText(result.launchUrl)
            .then(() => { message.textContent = 'Odeum 番組制作の「番組リンクを貼り付け」を押してください。'; })
            .catch(() => { field.select(); message.textContent = '表示中のリンクをコピーし、Odeum 番組制作へ貼り付けてください。'; });
        };
        links.append(field, copy);
        message.textContent = 'リンクをコピーし、Odeum 番組制作へ貼り付けてください（5分間有効）。';
      } else {
        const link = el('a', 'gl-btn', 'Odeum 配信元を開く');
        link.href = result.launchUrl; links.appendChild(link);
        message.textContent = 'リンクは5分間有効です。配信元はOdeumで選べます。';
      }
    } catch { message.textContent = '接続を準備できませんでした。'; }
    finally { producer.disabled = !project.value; source.disabled = false; }
  }
  producer.onclick = () => { void launch('producer'); };
  source.onclick = () => { void launch('presenter'); };
  if (operator) {
    box.append(el('span', 'gl-muted', 'Project GLab'), project, producer);
    void ctx.hubApi('/api/x/projects/projects').then(async (response) => {
      if (!response.ok) throw new Error('project_list_failed');
      const data = await response.json() as { projects: Array<{ id: string; name: string }> };
      for (const entry of data.projects) { const option = el('option', '', entry.name); option.value = entry.id; project.appendChild(option); }
      producer.disabled = !project.value;
      if (!project.value) message.textContent = '先にGLabへプロジェクトを登録してください。';
    }).catch(() => { message.textContent = 'プロジェクト一覧を取得できません。'; });
  }
  box.append(slot, source, links, message);
  return box;
}
