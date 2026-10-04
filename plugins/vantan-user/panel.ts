import { steamProfileSection } from './steam-profile-panel.ts';
import { facePhotoSection } from './face-photo-panel.ts';
import { publicNameSection } from './public-name-panel.ts';
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
  container.appendChild(box);
  container.appendChild(publicNameSection(ctx));
  container.appendChild(steamProfileSection(ctx));
  container.appendChild(facePhotoSection(ctx));
}
