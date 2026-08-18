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
| `attendance_status` | TEXT | NOT NULL / enum | **deprecated (v2P1)**。`unknown` / `present` / `absent` / `late` / `excused`。出席の正本は [`glab_attendance`](./glab-attendance.md) |
| `created_at` | INTEGER | NOT NULL | 初回アクセス時刻（epoch ms） |
| `updated_at` | INTEGER | NOT NULL | 状況更新時刻（epoch ms） |
| `updated_by` | TEXT | nullable | 最後に更新した admin の Cernere user_id |
| `attendance_event_id` | INTEGER | nullable | **deprecated (v2P1)**。直近に出席した `glab_event.id`。出席の正本は [`glab_attendance`](./glab-attendance.md) |
| `attendance_checked_in_at` | INTEGER | nullable | **deprecated (v2P1)**。Os attestation検証後の出席時刻（epoch ms）。出席の正本は [`glab_attendance`](./glab-attendance.md) |

初回アクセス時は `INSERT ... ON CONFLICT DO NOTHING` で `attendance_status=unknown` の行を確保する。
`glab_user` 自体は `projects` 等が参照するため残すが、出席の正本は
[`glab_attendance`](./glab-attendance.md) （集会出席の履歴台帳）であり、`attendance_status` /
`attendance_event_id` / `attendance_checked_in_at` の 3 列は互換のため列だけ温存した
deprecated compatibility field で、これ以上書き込みの正本として扱わない。DROP はしない。
