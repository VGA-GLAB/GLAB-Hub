# data/ — Volputas アンケートユーザー権限

| 項目 | 定義 |
|---|---|
| データ名 | `volputas_users` managed project / `project_data_volputas_users` |
| 種類 | user data（認可属性） |
| 権威ソース | Cernere |
| GLAB 内保存 | しない |
| 主キー | Cernere `users.id` と同じ `user_id` |
| 保護要否 | 個人に紐づく権限情報。保護必要 |
| 保護方法 | Cernere project WebSocket と `data_sharing` の read grant のみ |

## 列

| Cernere 列 | 型 | 既定 | module | 用途 |
|---|---|---|---|---|
| `can_create_surveys` | boolean | `false` | `survey_authoring` | アンケート作成を許可する |

`volputas_users` は GLAB に `survey_authoring` module の読み取りだけを許可する。
GLAB の作成 API はリクエストごとにログイン中の Cernere user ID でこの値を取得し、
値が厳密に `true` の場合だけ作成を許可する。行がない、値が不正、Cernere に接続できない場合は
権限なしとして扱うか 503 で失敗し、GLAB admin ロールへの暗黙フォールバックは行わない。
