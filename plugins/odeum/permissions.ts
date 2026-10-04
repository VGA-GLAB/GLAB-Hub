// 発表の開始 / 終了の権限判定。 イベントの正本は plugins/events (GLAB PostgreSQL)。

export interface PresentationActor {
  userId: string;
  isAdmin: boolean;
}

export interface PresentationEvent {
  created_by: string;
}

/** 発表を始められるのはイベント作成者か GLab 管理者だけ。 */
export function canStartPresentation(event: PresentationEvent, actor: PresentationActor): boolean {
  return actor.isAdmin || (actor.userId.length > 0 && event.created_by === actor.userId);
}

/** 終了は発表者本人・イベント作成者・管理者。 イベントが消えていても発表者は止められる。 */
export function canEndPresentation(
  session: { presenterUserId: string },
  event: PresentationEvent | null,
  actor: PresentationActor,
): boolean {
  if (actor.isAdmin) return true;
  if (session.presenterUserId === actor.userId) return true;
  return event != null && canStartPresentation(event, actor);
}
