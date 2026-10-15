// 施設・会議パネルの Google Meet 部分。会議ごとの Meet リンクの表示・発行と、
// Meet 代表アカウント / 自分の Google 連携の認可ボタンを持つ (サーバ側は meet-routes.ts)。

import { el, section, type PanelContext } from '../panel-kit.ts';

/** 自分が代表者 (Cr 組織の owner) の組織。組織で予約した会議の Meet はこの組織の代表アカウントで作る。 */
interface RepresentedOrganization { id: string; name: string; organizerConnected: boolean; isOrganizer: boolean }
interface MeetStatus {
  configured: boolean; isAdmin: boolean; organizerConnected: boolean; isOrganizer: boolean;
  organizations?: RepresentedOrganization[];
  googleConnected: boolean; email: string | null;
}
interface MeetLink { status: string; url?: string }

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z-]+$/;

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === 'string' && body.error.length < 200 ? body.error : fallback;
}

function meetAnchor(url: string): HTMLAnchorElement {
  const link = el('a', undefined, url) as HTMLAnchorElement;
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

/** 会議を作った直後に Meet リンクを発行する。失敗は文言で返す (会議の作成自体は成功している)。 */
export async function issueMeet(ctx: PanelContext, meetingId: string): Promise<{ url: string } | { error: string }> {
  const response = await ctx.api(`/meet/${encodeURIComponent(meetingId)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }).catch(() => null);
  if (!response) return { error: 'Meet を発行できませんでした。' };
  if (!response.ok) return { error: await errorMessage(response, 'Meet を発行できませんでした。') };
  const body = await response.json().catch(() => null) as MeetLink | null;
  return body?.status === 'ready' && body.url && MEET_URL.test(body.url) ? { url: body.url } : { error: 'Meet の設定が完了していません。' };
}

/** 会議カードに置く Meet 欄。オンライン参加可の会議だけに出す。 */
export function meetControls(ctx: PanelContext, meeting: { id: string; onlineAllowed: boolean; canManage: boolean; state: string }): HTMLElement | null {
  if (!meeting.onlineAllowed || meeting.state === 'cancelled') return null;
  const row = el('div', 'gl-row');
  const message = el('span', 'gl-muted', 'Meet を確認中…');
  row.append(el('strong', undefined, 'Google Meet'), message);
  const show = (url: string): void => {
    const copy = el('button', 'gl-btn ghost', 'コピー') as HTMLButtonElement; copy.type = 'button';
    copy.onclick = () => void navigator.clipboard.writeText(url).then(() => { copy.textContent = 'コピーしました'; }, () => { copy.textContent = 'コピーできません'; });
    message.replaceWith(meetAnchor(url));
    row.append(copy);
  };
  void (async () => {
    const response = await ctx.api(`/meet/${encodeURIComponent(meeting.id)}`).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) as MeetLink | null : null;
    if (body?.status === 'ready' && body.url && MEET_URL.test(body.url)) { show(body.url); return; }
    if (!meeting.canManage) { message.textContent = '主催者が Meet を発行するとここにリンクが出ます。'; return; }
    message.textContent = body?.status === 'uncertain' ? 'Meet の作成結果が不明です。管理者に確認してください。' : '';
    if (body?.status === 'uncertain') return;
    const issue = el('button', 'gl-btn ghost', 'Meet リンクを発行') as HTMLButtonElement; issue.type = 'button';
    issue.onclick = async () => {
      issue.disabled = true; message.textContent = 'Meet を作成中…';
      const result = await issueMeet(ctx, meeting.id);
      if ('url' in result) { issue.remove(); show(result.url); }
      else { message.textContent = result.error; issue.disabled = false; }
    };
    row.append(issue);
  })();
  return row;
}

/** Google の認可を popup で開く。popup を同期で開いてから URL を入れる (ポップアップブロック対策)。 */
async function startAuthorization(ctx: PanelContext, target: { mode: 'creator' | 'organizer'; organizationId?: string }, status: HTMLElement): Promise<void> {
  const popup = window.open('', '_blank', 'width=520,height=680');
  if (!popup) { status.textContent = 'ポップアップを許可して再試行してください。'; return; }
  popup.opener = window;
  const response = await ctx.api('/meet/oauth/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target),
  }).catch(() => null);
  const body = response?.ok ? await response.json().catch(() => null) as { url?: unknown } | null : null;
  if (typeof body?.url !== 'string' || !body.url.startsWith('https://accounts.google.com/')) {
    popup.close();
    status.textContent = response ? await errorMessage(response, 'Google 認可を開始できませんでした。') : 'Google 認可を開始できませんでした。';
    return;
  }
  popup.location.replace(body.url);
  status.textContent = 'Google の画面で認可してください。';
}

/** 自分が代表者の組織ごとに、組織の Meet 代表アカウントの状態と認可ボタンを出す。 */
function organizationRows(ctx: PanelContext, organizations: RepresentedOrganization[], status: HTMLElement): HTMLElement[] {
  return organizations.map((organization) => {
    const row = el('div', 'gl-row');
    const state = organization.organizerConnected
      ? `組織「${organization.name}」の Meet 代表アカウントは設定済みです${organization.isOrganizer ? ' (あなた)' : ''}。`
      : `組織「${organization.name}」の Meet 代表アカウントが未設定です。組織で予約した会議の Meet はこの代表アカウントで作られます。`;
    const button = el('button', 'gl-btn ghost', organization.isOrganizer ? '組織の代表アカウントを Google で再認可' : '組織の Meet 代表にする (Google で認可)') as HTMLButtonElement;
    button.type = 'button';
    button.onclick = () => void startAuthorization(ctx, { mode: 'organizer', organizationId: organization.id }, status);
    row.append(el('span', 'gl-muted', state), button);
    return row;
  });
}

/** Meet 代表アカウント (組織の代表者 / GLab でログインした Ae 管理者) と自分の Google 連携の欄。 */
export async function renderMeetAccount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  const block = section('Google Meet');
  container.append(block.wrap);
  const status = el('p', 'gl-muted'); status.setAttribute('role', 'status');
  const render = async (): Promise<void> => {
    block.body.replaceChildren();
    const response = await ctx.api('/meet/status').catch(() => null);
    const value = response?.ok ? await response.json().catch(() => null) as MeetStatus | null : null;
    if (!value) { block.body.append(el('p', 'gl-muted', 'Meet 連携の状態を取得できませんでした (Aedilis 未接続または未更新)。')); return; }
    if (!value.configured) { block.body.append(el('p', 'gl-muted', 'Aedilis の Google API 設定がまだありません。')); return; }
    block.body.append(el('p', 'gl-muted', value.organizerConnected
      ? `全体の Meet 代表アカウントは設定済みです${value.isOrganizer ? ' (あなた)' : ''}。組織の代表アカウントが無い会議はこのアカウントで作ります。`
      : '全体の Meet 代表アカウントが未設定です。組織で予約した会議は組織の代表者が認可すると Meet リンクを発行できます。'));
    const organizations = Array.isArray(value.organizations) ? value.organizations : [];
    block.body.append(...organizationRows(ctx, organizations, status));
    const actions = el('div', 'gl-row');
    if (value.isAdmin) {
      const organizer = el('button', 'gl-btn ghost', value.isOrganizer ? '全体の代表アカウントを Google で再認可' : 'このアカウントを全体の Meet 代表にする (Google で認可)') as HTMLButtonElement;
      organizer.type = 'button';
      organizer.onclick = () => void startAuthorization(ctx, { mode: 'organizer' }, status);
      actions.append(organizer);
    }
    // 代表アカウントの Google は代表用の権限を持つので、作成者の連携で上書きしない (Aedilis も拒否する)。
    if (!value.isOrganizer && !organizations.some(organization => organization.isOrganizer)) {
      const creator = el('button', 'gl-btn ghost', value.googleConnected ? `Google 連携済み (${value.email ?? ''}) を更新` : '自分の Google を連携 (共同ホストになる・任意)') as HTMLButtonElement;
      creator.type = 'button';
      creator.onclick = () => void startAuthorization(ctx, { mode: 'creator' }, status);
      actions.append(creator);
    }
    // Google の画面が opener を切る (COOP) と結果の通知が届かないので、手動の更新も置く。
    const refresh = el('button', 'gl-btn ghost', '状態を更新') as HTMLButtonElement;
    refresh.type = 'button';
    refresh.onclick = () => void render();
    actions.append(refresh);
    block.body.append(actions, status);
  };
  const onMessage = (event: MessageEvent): void => {
    // パネルを開き直すたびに付くので、外れたパネルの受け手は自分で外す。
    if (!block.wrap.isConnected) { window.removeEventListener('message', onMessage); return; }
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: unknown; result?: unknown } | null;
    if (data?.type !== 'glab-meet-oauth') return;
    void render().then(() => {
      status.textContent = data.result === 'failed' ? 'Google 認可を完了できませんでした。' : 'Google 認可を反映しました。';
    });
  };
  window.addEventListener('message', onMessage);
  await render();
}
