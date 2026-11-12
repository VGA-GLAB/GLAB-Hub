/**
 * Cernere の GLAB 用 user_data のうち、profile module の列。
 *
 * 値の入力は Cernere のログイン時入力 (signup_fields) が行い、GLAB は読むだけ。列の定義は
 * Cernere migration 078 / 079 と `service/glab/schema.json` で入ったものと同じにする。
 *
 * GLAB は起動時に `managed_project.update_schema` で user_data を宣言する。この宣言は列の
 * 全置換で、宣言から漏れた列は Cernere で論理削除 (`_deleted`) される。論理削除された列は
 * GLAB からは読めず、Cernere のログイン時入力でも聞かれないため、プロフィール登録の案内が
 * 消えなくなる。宣言には必ずこの列を含める (user-data-columns.ts)。
 */
export const PROFILE_COLUMNS = {
  name: { type: 'text', module: 'profile', nullable: false, description: '氏名' },
  role_title: { type: 'text', module: 'profile', nullable: false, description: '役職' },
  member_type: { type: 'text', module: 'profile', nullable: true, description: '在校生 student / OB alumni' },
  nickname: { type: 'text', module: 'profile', nullable: true, description: '任意のニックネーム' },
  company: { type: 'text', module: 'profile', nullable: true, description: 'OBの会社（任意）' },
  department_name: { type: 'text', module: 'profile', nullable: true, description: '所属学科（在校生は必須）' },
  grade: { type: 'integer', module: 'profile', nullable: true, description: '学年' },
  desired_job: { type: 'text', module: 'profile', nullable: true, description: '希望職種' },
} as const;
