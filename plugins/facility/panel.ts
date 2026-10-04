import { el, ensureStyles, type PanelContext } from '../panel-kit.ts';
import { requireOk, type Facility, type Group } from './audience-fields.ts';
import { renderReservations } from './reservation-panel.ts';
import { renderMeetings } from './meeting-panel.ts';

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  container.replaceChildren(el('h2', undefined, '施設・会議予約'));
  try {
    const [groupResponse, facilityResponse] = await Promise.all([ctx.api('/groups'), ctx.api('/facilities')]);
    await requireOk(groupResponse); await requireOk(facilityResponse);
    const groups = (await groupResponse.json() as { items: Group[] }).items;
    const facilities = (await facilityResponse.json() as { items: Facility[] }).items;
    await renderReservations(container, ctx, facilities, groups);
    await renderMeetings(container, ctx, facilities, groups);
  } catch (error) {
    const message = el('p', 'gl-muted', error instanceof Error ? error.message : '予約を読み込めませんでした。');
    message.setAttribute('role', 'alert');
    const retry = el('button', 'gl-btn', '再読み込み'); retry.onclick = () => void mount(container, ctx);
    container.append(message, retry);
  }
}
