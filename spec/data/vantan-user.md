# data/ — Vantan 共通ユーザープロフィール

| 項目 | 定義 |
|---|---|
| データ名 | `vantan_user` |
| 種類 | user data |
| 権威ソース | Cernere `project_data_vantan_user` |
| GLAB 内保存 | しない |
| 保護要否 | 個人データ。認証済み本人と Cernere `data_sharing` 許可済み project のみ |
| 転送 | GLAB server ↔ Cernere の認証済み project WebSocket |

## GLAB が扱う必須列

| Cernere 列 | UI ラベル | 型 | 必須 | module |
|---|---|---|---|---|
| `name` | 名前 | text | ○ | `profile` |
| `role_title` | 役職 | text | ○ | `profile` |
| `department_name` | 学科 | text | ○ | `profile` |

既存の `grade`（学年）と `desired_job`（希望職種）は互換性のため保持するが、GLAB 初回登録の
必須項目には含めない。

GLAB は Cernere の `vantan_user.data_sharing` にある
`{ project_key: "glab", modules: ["profile"], access: "readwrite" }` の範囲のみを扱う。
秘密情報やプロフィール値をログ・例外本文・GLAB SQLite に残さない。
GLAB SQLite には別データとして Cernere `user_id` と現在の出席状況だけを保持する。
