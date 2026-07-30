# data/ — `glab_project_release`

GitHub 公開 Release の表示・Discord 通知用キャッシュ。GitHub token と API 応答全体は保存しない。

| カラム | 型 | 意味 |
|---|---|---|
| `project_id`, `release_id` | TEXT, INTEGER | プロジェクトと GitHub Release の複合主キー |
| `tag`, `name`, `published_at` | TEXT | 表示する Release 情報。無題 Release は `name` に tag を入れる |
| `assets_json` | TEXT | asset の `name` / `size` / `browserDownloadUrl` の配列 |
| `synced_at` | INTEGER | GitHub 同期時刻 |
| `notified_at` | INTEGER? | Discord 投稿成功時刻。未通知判定に使う |

`project_id, published_at` index を一覧と未通知 Release の検索に使用する。`glab_project` には
`description_synced_at`・`description_manual`・`releases_synced_at` を追加し、手動で編集された説明を
同期で上書きしない。`releases_synced_at` が未設定 (= そのプロジェクトの初回同期) で取り込んだ Release は
`notified_at` を同期時刻で埋め、過去分が Discord に一斉投稿されるのを防ぐ。
