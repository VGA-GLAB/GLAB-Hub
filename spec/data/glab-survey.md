# data/ — アンケートデータ境界

GLABはアンケート定義・回答を保存しない。

| データ | 権威ソース | GLABの役割 |
|---|---|---|
| 設問、分類、GLAB公開可否 | Volputas `surveys` | Volputasのフィルタ済みAPIを中継してCorpus表示 |
| 本人回答、回答済み状態 | Cernere `volputas_survey_responses` / `volputas_survey_answers` | Volputas APIへの回答送信と結果表示 |

旧 `glab_survey` / `glab_survey_response` / `glab_survey_submission` は新規作成・参照しない。
既存SQLiteに残る旧テーブルはデータ保全のため自動削除しないが、実行時機能からは退役済み。

GLAB→VolputasはCernereの短命user-for-project PASETOを使うため、Volputas独自ログインは不要。
