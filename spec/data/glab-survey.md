# data/ — GLAB アンケートと回答履歴

| データ名 | 種類 | 権威ソース | 保存先 | 保護要否 | 保護方法 |
|---|---|---|---|---|---|
| アンケート定義 | master data | GLAB | `glab_survey` | 作成者 ID は個人識別子 | 認証済みユーザーのみ参照、作成は Cernere 権限必須 |
| アンケート回答 | user data | GLAB | `glab_survey_submission` | 回答本文と user ID を保護 | 本人が送信、回答一覧は GLAB admin のみ、ログ出力禁止 |
| 旧回答 | user data（移行元） | GLAB | `glab_survey_response` | 同上 | 読み取り専用で保持し、起動時に新テーブルへ冪等移行 |

## `glab_survey`

| 列 | 型 | 制約 | 用途 |
|---|---|---|---|
| `id` | INTEGER | PK | アンケート ID |
| `title` | TEXT | NOT NULL | タイトル |
| `description` | TEXT | nullable | 説明 |
| `questions` | TEXT | NOT NULL / JSON | Voluptas 互換の尺度・単一選択・自由記述設問 |
| `is_active` | INTEGER | 0/1 | 回答受付中か |
| `allow_multiple_responses` | INTEGER | 0/1 | 同一ユーザーの複数回答を許可するか |
| `created_by` | TEXT | NOT NULL | Cernere user ID |
| `created_at` / `updated_at` | INTEGER | NOT NULL | epoch ms |

## `glab_survey_submission`

`response_key` により回答の一意性を切り替える。単回答アンケートは固定値 `single` を使い
`(survey_id, user_id, response_key)` の競合更新にする。複数回答アンケートは送信ごとに
新しい UUID を使うため、各回答が独立した履歴として追加される。

旧 `glab_survey_response` の行も `response_key=single` として `INSERT OR IGNORE` で移行する。
旧テーブルはデータ保全のため削除しない。
