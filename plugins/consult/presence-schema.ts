import type { CernereProjectClient } from '../cernere/project-client.ts';

/**
 * おれひまが使う user_data 列を Cernere へ宣言する。
 *
 * Cernere はサービスの実態を知らずに解決する設計なので、presence 列を Cernere 側の
 * migration や service/<id>/schema.json に書いてもらうことはしない。列の正本は
 * こちら側にあり、起動時に managed_project.update_schema で宣言する。
 * project_data_<key> の DDL は Cernere の schema-migrator が宣言から生成する。
 *
 * identity_claims (discord_id の開示) は **管理者所有**なのでここからは触れない。
 * 自己申告しても Cernere 側で捨てられる。付与は Cernere の管理操作で行う。
 */
export const PRESENCE_COLUMNS = {
  available_now: {
    type: 'boolean',
    module: 'presence',
    nullable: true,
    default_value: 'false',
    description: 'おれひまフラグ',
  },
  available_until: {
    type: 'timestamp',
    module: 'presence',
    nullable: true,
    description: 'おれひま有効期限',
  },
} as const;

// client ごとに宣言を 1 回だけ走らせ、以降は同じ Promise を配る。
// presence 操作は宣言の完了を待つ必要がある — 未宣言のまま list_user_data を
// 呼ぶと Cernere が「宣言されていない列」として拒否するため、起動直後の
// 数リクエストだけ 503 になる、という分かりにくい失敗になる。
const declarations = new WeakMap<CernereProjectClient, Promise<void>>();

/**
 * 宣言は部分更新 (updateProjectSchema の partial-update semantics) なので、
 * 既存の列や管理者所有フィールドを消さない。
 *
 * 失敗しても hub の起動は続ける。Cernere 未起動でも GLab 自体は上がる方針に合わせ、
 * ここで throw すると presence 以外のタブまで巻き込むため。
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
    .call('managed_project', 'update_schema', { user_data: { columns: PRESENCE_COLUMNS } })
    .then(() => undefined)
    .catch((error: unknown) => {
      log(`presence schema declaration failed: ${error instanceof Error ? error.message : String(error)}`);
      declarations.delete(client);
    });

  declarations.set(client, pending);
  return pending;
}
