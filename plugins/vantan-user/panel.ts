import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  container.innerHTML = '';
  const box = el('section', 'gl-notice gl-profile-gate');
  box.appendChild(el('h2', undefined, '👤 Vantan プロフィール'));
  box.appendChild(el(
    'p',
    'gl-muted',
    '名前・役職・学科は登録済みです。プロフィールの単一情報源は Cernere です。',
  ));
  container.appendChild(box);
}
