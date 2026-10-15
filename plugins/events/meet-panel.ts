// イベント画面の Google Meet 部分。登録フォームの「Meet リンクを発行する」と、一覧の Meet リンク表示・再発行
// (サーバ側は events/index.ts の /events/:id/meet と meet-client.ts)。

import { el, type PanelContext } from '../panel-kit.ts';

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z-]+$/;

interface MeetFormControls {
  element: HTMLElement;
  /** POST /events に重ねる値。チェックが無ければ空。 */
  value(): { meet?: true; meetOrganizationId?: string };
}

/** 登録フォームの Meet 欄。組織を選ぶと、その組織の代表アカウントで Meet を作る (未認可なら全体の代表)。 */
export function meetFormControls(ctx: PanelContext): MeetFormControls {
  const element = el('div', 'gl-row');
  const enabled = el('input');
  enabled.type = 'checkbox';
  const label = el('label', 'gl-check');
  label.append(enabled, ' Google Meet のリンクを発行する');
  const organization = el('select', 'gl-select');
  organization.title = 'Meet の代表アカウントにする組織';
  const none = el('option', undefined, '代表: 全体の代表アカウント');
  none.value = '';
  organization.appendChild(none);
  organization.disabled = true;
  enabled.onchange = () => { organization.disabled = !enabled.checked; };
  element.append(label, organization);
  void ctx.api('/meet/organizations').then(async (response) => {
    const body = response.ok ? await response.json().catch(() => null) as { items?: { id: string; name: string }[] } | null : null;
    for (const item of body?.items ?? []) {
      const option = el('option', undefined, `代表: 組織「${item.name}」`);
      option.value = item.id;
      organization.appendChild(option);
    }
  }).catch(() => undefined);
  return {
    element,
    value: () => enabled.checked
      ? { meet: true, ...(organization.value ? { meetOrganizationId: organization.value } : {}) }
      : {},
  };
}

function meetAnchor(url: string): HTMLAnchorElement {
  const link = el('a', undefined, url) as HTMLAnchorElement;
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

/** 一覧の Meet 欄。発行済みならリンク、未発行なら発行ボタン (登録者と管理者だけが通る)。 */
export function eventMeetControls(ctx: PanelContext, event: { id: number; meetUrl: string | null }): HTMLElement {
  const row = el('div', 'gl-row');
  if (event.meetUrl && MEET_URL.test(event.meetUrl)) {
    row.append(el('strong', undefined, 'Google Meet'), meetAnchor(event.meetUrl));
    return row;
  }
  const message = el('span', 'gl-muted');
  const issue = el('button', 'gl-btn ghost', 'Meet リンクを発行') as HTMLButtonElement;
  issue.type = 'button';
  issue.onclick = () => {
    issue.disabled = true;
    message.textContent = 'Meet を作成中…';
    void ctx.api(`/events/${event.id}/meet`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }).then(async (response) => {
      const body = await response.json().catch(() => null) as { meetUrl?: unknown; error?: unknown } | null;
      if (response.ok && typeof body?.meetUrl === 'string' && MEET_URL.test(body.meetUrl)) {
        issue.remove();
        message.replaceWith(meetAnchor(body.meetUrl));
        return;
      }
      message.textContent = response.status === 403
        ? 'Meet はイベントの登録者か管理者が発行できます。'
        : `Meet を発行できませんでした${typeof body?.error === 'string' && body.error.length < 200 ? ` (${body.error})` : ''}。`;
      issue.disabled = false;
    }).catch(() => {
      message.textContent = 'Meet を発行できませんでした。';
      issue.disabled = false;
    });
  };
  row.append(issue, message);
  return row;
}
