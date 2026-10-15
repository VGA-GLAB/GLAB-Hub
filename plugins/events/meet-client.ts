// イベントの Google Meet。Meet の作成は Aedilis が代表アカウントで行い、GLab は署名付き中継
// (x-glab-booking-context) で頼むだけ (Aedilis spec SPEC-MANAGED-MEET-EXTERNAL-EVENT、neco 2026-10-15
// 「(Meet を GLAB のイベントにも) つけます」)。見せる相手と発行できる人は GLab が決める。

import type { Context, CorpusContext, ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { bookingGroups, bookingProxy } from '../facility/booking-proxy.ts';

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z-]+$/;
export const ORGANIZATION_ID = /^[A-Za-z0-9_-]{1,200}$/;

export type EventMeetResult = { url: string } | { error: string };

/** Aedilis のエラー文 (固定文言) だけを返す。上流の詳細や URL 以外の値は通さない。 */
async function failure(response: Response): Promise<EventMeetResult> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return { error: typeof body?.error === 'string' && body.error.length < 200 ? body.error : 'meet_unavailable' };
}

/**
 * イベントの Meet リンクを発行する (発行済みならそのリンク)。`organizationId` を付けると、その組織の代表者が
 * 認可済みなら代表アカウントで作る。組織は署名した自分の所属から Aedilis が確かめる。
 */
export async function issueEventMeet(
  c: Context, ctx: CorpusContext, aedilis: ServiceConnector, eventId: number, organizationId: string | null,
  readGroups: typeof bookingGroups = bookingGroups,
): Promise<EventMeetResult> {
  const response = await bookingProxy(c, ctx, aedilis, `/api/meet/external/glab-event/${eventId}`, readGroups, {
    method: 'POST', body: JSON.stringify(organizationId ? { organizationId } : {}),
  });
  if (!response.ok) return failure(response);
  const body = await response.json().catch(() => null) as { status?: unknown; url?: unknown } | null;
  return body?.status === 'ready' && typeof body.url === 'string' && MEET_URL.test(body.url)
    ? { url: body.url }
    : { error: 'Meet の設定が完了していません。' };
}

/** Meet の代表にできる組織 (自分が所属する Cr の組織)。取れなければ空。 */
export async function meetOrganizations(c: Context, ctx: CorpusContext): Promise<{ id: string; name: string }[]> {
  const groups = await bookingGroups(c, ctx);
  return groups.filter(group => group.kind === 'organization').map(group => ({ id: group.id, name: group.name }));
}

export function isMeetUrl(value: unknown): value is string {
  return typeof value === 'string' && MEET_URL.test(value);
}
