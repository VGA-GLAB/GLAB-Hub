# data/ — GLAB ユーザ参照と現在の出席状況

| 項目 | 定義 |
|---|---|
| データ名 | `glab_user` |
| 種類 | user data（GLAB 固有） |
| 権威ソース | GLAB `data/corpus.db` |
| 保護要否 | `user_id` は個人識別子。認証済み本人と admin のみ参照 |
| Cernere との分担 | 名前・役職・学科は `vantan_user` にのみ保存 |

## 列

| 列 | 型 | 制約 | 用途 |
|---|---|---|---|
| `user_id` | TEXT | PK | Cernere sub claim。GLAB 内の参照キー |
| `attendance_status` | TEXT | NOT NULL / enum | `unknown` / `present` / `absent` / `late` / `excused` |
| `created_at` | INTEGER | NOT NULL | 初回アクセス時刻（epoch ms） |
| `updated_at` | INTEGER | NOT NULL | 状況更新時刻（epoch ms） |
| `updated_by` | TEXT | nullable | 最後に更新した admin の Cernere user_id |
| `attendance_event_id` | INTEGER | nullable | 直近に出席した `glab_event.id` |
| `attendance_checked_in_at` | INTEGER | nullable | Os attestation検証後の出席時刻（epoch ms） |

初回アクセス時は `INSERT ... ON CONFLICT DO NOTHING` で `attendance_status=unknown` の行を確保する。
現在状況と直近イベントだけを保持し、出席履歴や Cernere プロフィールの複製は行わない。
