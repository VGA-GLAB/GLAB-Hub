import type { CernereProjectApi } from '../cernere/shared-owner.ts';

/**
 * Cernere で利用者が GLAB へのプロフィール提供 (user_data.module:profile) を許可しているか。
 * `unknown` は旧 Cernere (state 無し) や応答不正・取得失敗で判断できない状態。
 *
 * @implements SPEC-GLAB-PERSONAL-DATA-001
 */
export type ProfileAccess = 'granted' | 'denied' | 'undecided' | 'unknown';

const PROFILE_MODULE = 'profile';
const PROFILE_PERMISSION_KEY = 'user_data.module:profile';
const PERMISSION_STATES: readonly ProfileAccess[] = ['granted', 'denied', 'undecided'];

/** `managed_project.get_user_permissions` の生応答から profile 提供状態を読む。 */
export function profileAccessOf(raw: unknown): ProfileAccess {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const response = raw as Record<string, unknown>;
  const optedOut = response.optedOutModules;
  const hasOptOutList = Array.isArray(optedOut) && optedOut.every((item) => typeof item === 'string');
  if (hasOptOutList && optedOut.includes(PROFILE_MODULE)) return 'denied';

  if (Array.isArray(response.permissions)) {
    const entry = response.permissions.find((item: unknown) =>
      !!item && typeof item === 'object' && (item as Record<string, unknown>).key === PROFILE_PERMISSION_KEY);
    if (entry) {
      const state = (entry as Record<string, unknown>).state;
      return typeof state === 'string' && (PERMISSION_STATES as readonly string[]).includes(state)
        ? state as ProfileAccess
        : 'unknown';
    }
    // 拒否一覧を返す新しい Cernere で profile が宣言外なら、拒否はされていない。
    return hasOptOutList ? 'granted' : 'unknown';
  }
  return 'unknown';
}

/** Cernere へ問い合わせる。失敗しても登録案内は出せるので `unknown` に倒す。 */
export async function getProfileAccess(client: Pick<CernereProjectApi, 'call'>, userId: string): Promise<ProfileAccess> {
  try {
    return profileAccessOf(await client.call('managed_project', 'get_user_permissions', { userId }));
  } catch {
    return 'unknown';
  }
}

/**
 * Cernere の「サービスの権限」画面 (/data-optout) の URL。権限の再許可と signup_fields の入力ができる。
 * HTTP(S) かつ資格情報を含まない base だけを受け付け、それ以外・未設定は null。
 */
export function profileInputUrl(base: string | undefined): string | null {
  const value = base?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL('/data-optout', value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}
