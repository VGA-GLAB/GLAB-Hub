import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

interface DiEntryPoints {
  discussionLaunchPath: string;
  learningUrl: string;
}

function parseEntryPoints(value: unknown): DiEntryPoints | null {
  if (!value || typeof value !== 'object') return null;
  const fields = value as Record<string, unknown>;
  if (fields.discussionLaunchPath !== '/discussion-launch' || typeof fields.learningUrl !== 'string') {
    return null;
  }
  try {
    if (!['http:', 'https:'].includes(new URL(fields.learningUrl).protocol)) return null;
  } catch {
    return null;
  }
  return { discussionLaunchPath: fields.discussionLaunchPath, learningUrl: fields.learningUrl };
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '💬 Di'));

  const response = await ctx.api('/entry-points').catch(() => null);
  if (!response?.ok) {
    renderUnavailable(container);
    return;
  }
  const entryPoints = parseEntryPoints(await response.json().catch(() => null));
  if (!entryPoints) {
    renderUnavailable(container);
    return;
  }

  const discussion = section('議論');
  discussion.body.appendChild(el(
    'p',
    'gl-muted',
    'Di の議論画面を開きます。開始した議論には、レート制限・検閲トレース用としてCernere IDが安全に関連付けられます。',
  ));
  const launch = el('button', 'gl-btn', '議論を開く');
  const message = el('span', 'gl-muted');
  launch.onclick = () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      message.textContent = 'ポップアップを許可して再試行してください。';
      return;
    }
    popup.opener = null;
    launch.disabled = true;
    message.textContent = 'Di に接続中…';
    void ctx.api(entryPoints.discussionLaunchPath, { method: 'POST' })
      .then(async (result) => {
        const body = await result.json().catch(() => null) as { url?: unknown } | null;
        if (!result.ok || typeof body?.url !== 'string') throw new Error('launch failed');
        popup.location.replace(body.url);
        message.textContent = '';
      })
      .catch(() => {
        popup.close();
        message.textContent = 'Di の議論画面を開けませんでした。';
      })
      .finally(() => {
        launch.disabled = false;
      });
  };
  const discussionActions = el('div', 'gl-row');
  discussionActions.append(launch, message);
  discussion.body.appendChild(discussionActions);
  container.appendChild(discussion.wrap);

  const learning = section('学習ビュー');
  learning.body.appendChild(el('p', 'gl-muted', '収集した学習データ、議論の結論、ギャップをDiで確認します。'));
  const learningLink = el('a', 'gl-btn', '学習ビューを開く');
  learningLink.href = entryPoints.learningUrl;
  learningLink.target = '_blank';
  learningLink.rel = 'noopener noreferrer';
  learning.body.appendChild(learningLink);
  container.appendChild(learning.wrap);
}

function renderUnavailable(container: HTMLElement): void {
  const notice = el('div', 'gl-notice');
  notice.appendChild(el('strong', undefined, 'Di に未接続'));
  notice.appendChild(el('p', 'gl-muted', 'Di が稼働して接続設定が入ると利用できます。'));
  container.appendChild(notice);
}
