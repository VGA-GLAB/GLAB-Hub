import { steamProfileSection } from './steam-profile-panel.ts';
import { facePhotoSection } from './face-photo-panel.ts';
import { publicNameSection } from './public-name-panel.ts';
import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import { cernereLinkSection } from './cernere-link-panel.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  container.innerHTML = '';
  const box = el('section', 'gl-notice gl-profile-gate');
  box.appendChild(el('h2', undefined, '個人データ'));
  container.appendChild(box);
  container.appendChild(publicNameSection(ctx));
  container.appendChild(steamProfileSection(ctx));
  container.appendChild(facePhotoSection(ctx));
  container.appendChild(cernereLinkSection(ctx));
}
