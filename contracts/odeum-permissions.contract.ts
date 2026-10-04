import type { PresentationActor, PresentationEvent } from '../plugins/odeum/permissions.ts';

export default {
  /** C-3: 開始を許すのはイベント作成者か管理者だけ。 */
  post: (result: boolean, event: PresentationEvent, actor: PresentationActor): boolean =>
    result === (actor.isAdmin || (actor.userId !== '' && actor.userId === event.created_by)),
};
