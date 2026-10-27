# data/ — Vantan 共通ユーザープロフィール

| 項目 | 定義 |
|---|---|
| データ名 | `vantan_user` |
| 種類 | user data |
| 権威ソース | Cernere `project_data_glab` |
| GLAB 内保存 | しない |
| 保護要否 | 個人データ。認証済み本人と Cernere `data_sharing` 許可済み project のみ |
| 転送 | GLAB server ↔ Cernere の認証済み project WebSocket |

## GLAB が扱う必須列

| Cernere 列 | UI ラベル | 型 | 必須 | module |
|---|---|---|---|---|
| `name` | 名前 | text | ○ | `profile` |
| `member_type` | 在校生／OB | text | ○ | `profile` |
| `nickname` | ニックネーム | text | 任意 | `profile` |
| `role_title` | 役職 | text | ○ | `profile` |
| `department_name` | 学科 | text | 在校生のみ | `profile` |
| `grade` | 学年 | integer | 在校生のみ（1以上） | `profile` |
| `company` | 会社 | text | 任意・OBのみ表示 | `profile` |

`desired_job`（希望職種）は互換性のため保持し、初回登録には含めない。

GLAB は自身の `glab` project の profile 列を認証済み接続で読み書きする。
登録画面は Cernere の signup_fields version 3 を用いる。migration 079 の適用が必要。
秘密情報やプロフィール値をログ・例外本文・GLAB SQLite に残さない。
GLAB SQLite には別データとして Cernere `user_id` と現在の出席状況だけを保持する。
