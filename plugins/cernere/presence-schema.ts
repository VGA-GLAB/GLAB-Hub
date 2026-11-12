/**
 * GLAB の user_data 列を Cernere へ宣言する。presence 操作の前に完了を待つ。
 *
 * identity_claims (discord_id の開示) は **管理者所有**なのでここからは触れない。
 * 自己申告しても Cernere 側で捨てられる。付与は Cernere の管理操作で行う。
 */
import type { CernereProjectApi as CernereProjectClient } from './shared-owner.ts';
import { GLAB_USER_DATA_COLUMNS } from './user-data-columns.ts';

export { PRESENCE_COLUMNS } from './presence-columns.ts';

// client ごとに宣言を 1 回だけ走らせ、以降は同じ Promise を配る。
// presence 操作は宣言の完了を待つ必要がある — 未宣言のまま list_user_data を
// 呼ぶと Cernere が「宣言されていない列」として拒否するため、起動直後の
// 数リクエストだけ 503 になる、という分かりにくい失敗になる。
const declarations = new WeakMap<CernereProjectClient, Promise<void>>();

/**
 * user_data.columns は全置換。presence だけでなく profile を含む GLAB の全列 (GLAB_USER_DATA_COLUMNS) を
 * 必ず同時に宣言し、起動時の宣言がプロフィール列や他方の presence 列を論理削除することを防ぐ。
 *
 * 要求時は失敗を返して未宣言のまま読み書きしない。起動時の呼び出し元だけが
 * 失敗を処理し、presence 以外の機能の起動を継続する。
 * 失敗を記憶すると Cernere 復帰後も永久に未宣言のままになるので、
 * 失敗した宣言は忘れて次の presence 操作で再試行する。
 */
/** @implements SPEC-CONSULT-PRESENCE-004 */
export function declarePresenceSchema(
  client: CernereProjectClient,
  // setup 時は hub の logger を渡す。presence 操作から呼ばれる再試行経路は
  // 呼び出し側が 503 として報告するため、既定は握り潰さず console に残すだけにする。
  log: (message: string) => void = (message) => console.error(`[consult] ${message}`),
): Promise<void> {
  const existing = declarations.get(client);
  if (existing) return existing;

  const pending = client
    .call('managed_project', 'update_schema', { user_data: { columns: GLAB_USER_DATA_COLUMNS } })
    .then(() => undefined)
    .catch((error: unknown) => {
      log(`presence schema declaration failed: ${error instanceof Error ? error.message : String(error)}`);
      declarations.delete(client);
      throw error;
    });

  declarations.set(client, pending);
  return pending;
}
