import { PRESENCE_COLUMNS } from './presence-columns.ts';
import { PROFILE_COLUMNS } from './profile-columns.ts';

/**
 * GLAB が Cernere に宣言する user_data の全列。
 *
 * `managed_project.update_schema` の user_data.columns は全置換なので、宣言は常にこの全体で行う。
 * 一部の module だけを送ると、送らなかった列が論理削除される。glab の user_data に列を足すときは
 * ここへ module ごとの定義を加える。
 */
export const GLAB_USER_DATA_COLUMNS = {
  ...PROFILE_COLUMNS,
  ...PRESENCE_COLUMNS,
} as const;
