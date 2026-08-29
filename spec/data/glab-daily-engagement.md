# data/ — GLAB 日次コンテンツ

5分クエスト、スポットライト、ユーザー別達成、Discord 通知成功を Web hub と Bot が共有する。
スキーマ正本は [`plugins/data.ts`](../../plugins/data.ts) の `ensureDailyEngagementSchema`、保存先は
Corpus と同じ `data/corpus.db`（SQLite, WAL）。

## `glab_daily_content`

| カラム | 型 | 制約 / 意味 |
|---|---|---|
| `date_key` | TEXT | PRIMARY KEY。`Asia/Tokyo` の `YYYY-MM-DD` |
| `quest_key` | TEXT | コード内カタログを引く安定キー |
| `spotlight_project_id` | TEXT NULL | `glab_project(id)` 参照。active project がない日は NULL |
| `created_at` | INTEGER | 選択を固定した epoch ms |
| `discord_notified_at` | INTEGER NULL | Discord 投稿成功時刻。NULL は未通知 |
| `discord_message_id` | TEXT NULL | 成功した Discord message ID |

選択は `date_key` への `INSERT ... ON CONFLICT DO NOTHING` で競合時も1件に固定する。
プロジェクトの名前・説明・URLは `glab_project` を都度 JOIN し、このテーブルへ複製しない。

## `glab_daily_quest_completion`

| カラム | 型 | 制約 / 意味 |
|---|---|---|
| `date_key` | TEXT | `glab_daily_content(date_key)` 参照、複合主キー |
| `user_id` | TEXT | Cernere `user_id` の参照値、複合主キー |
| `completed_at` | INTEGER | 初回達成の epoch ms |

氏名・学科などの個人属性は保存しない。書き込みは Hub の認証済み dashboard route だけが行い、
`(date_key, user_id)` の主キーで連打を冪等化する。

## 保持と保護

公開的なプロジェクト紹介と活動有無の運用データであり、列暗号化は行わない。削除期限は設けず、
履歴は公平な巡回判定と本人の活動記録に使う。外部公開APIは持たない。
