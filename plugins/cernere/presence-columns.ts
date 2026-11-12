/**
 * おれひま・現在地が使う user_data 列 (presence module)。
 *
 * Cernere はサービスの実態を知らずに解決する設計なので、presence 列を Cernere 側の
 * migration に書いてもらうことはしない。列の正本はこちら側にあり、起動時に
 * managed_project.update_schema で宣言する (presence-schema.ts)。
 * project_data_<key> の DDL は Cernere の schema-migrator が宣言から生成する。
 */
export const PRESENCE_COLUMNS = {
  current_location: {
    type: 'text',
    module: 'presence',
    nullable: true,
    description: '本人申告の現在地: school / home / away、未設定は null',
  },
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
