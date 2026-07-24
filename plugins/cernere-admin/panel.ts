import { el, ensureStyles, section, type PanelContext } from '../panel-kit.ts';

interface CernereAdminEntryPoints {
  profileUrl: string;
  dataOptOutUrl: string;
  organizationsUrl: string;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function parseEntryPoints(value: unknown): CernereAdminEntryPoints | null {
  if (!value || typeof value !== 'object') return null;
  const fields = value as Record<string, unknown>;
  if (!isHttpUrl(fields.profileUrl) || !isHttpUrl(fields.dataOptOutUrl) || !isHttpUrl(fields.organizationsUrl)) {
    return null;
  }
  return {
    profileUrl: fields.profileUrl,
    dataOptOutUrl: fields.dataOptOutUrl,
    organizationsUrl: fields.organizationsUrl,
  };
}

function linkButton(label: string, href: string): HTMLAnchorElement {
  const link = el('a', 'gl-btn', label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '⚙️ Cernere 設定'));

  const response = await ctx.api('/entry-points').catch(() => null);
  const entryPoints = response?.ok
    ? parseEntryPoints(await response.json().catch(() => null))
    : null;
  if (!entryPoints) {
    const notice = el('div', 'gl-notice');
    notice.appendChild(el('strong', undefined, 'Cernere Web UI に未接続'));
    notice.appendChild(el('p', 'gl-muted', 'CERNERE_WEB_URL が設定され Cernere frontend が稼働すると利用できます。'));
    container.appendChild(notice);
    return;
  }

  const account = section('アカウント / パスキー');
  account.body.appendChild(el(
    'p',
    'gl-muted',
    'パスキー（Windows Hello / スマホ生体認証）の追加・削除と、他のデバイスを登録するためのリンク発行は Cernere のプロフィール画面で行います。',
  ));
  account.body.appendChild(linkButton('プロフィール / パスキー管理を開く', entryPoints.profileUrl));
  container.appendChild(account.wrap);

  const data = section('個人データ管理');
  data.body.appendChild(el(
    'p',
    'gl-muted',
    '各サービスに提供している個人データの確認とオプトアウトは Cernere が単一情報源です。',
  ));
  data.body.appendChild(linkButton('データ管理を開く', entryPoints.dataOptOutUrl));
  container.appendChild(data.wrap);

  const orgs = section('組織');
  orgs.body.appendChild(el('p', 'gl-muted', '所属組織の確認・管理を開きます。'));
  orgs.body.appendChild(linkButton('組織設定を開く', entryPoints.organizationsUrl));
  container.appendChild(orgs.wrap);
}
