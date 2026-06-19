# data/ — `glab_job` テーブル

GLAB メンバーが共有する就活情報（企業 / 募集 / 締切 / URL）を保持するテーブル。
スキーマ正本は [`plugins/data.ts`](../../plugins/data.ts) の `GLAB_SCHEMA`。Web hub
プラグイン（`plugins/jobs`）と Discord Bot（`bot/`）が同じ `data/corpus.db`（SQLite, WAL）を
共有する（[DESIGN.md](../../DESIGN.md) §4）。

## 種別・保存先

| 項目 | 内容 |
|---|---|
| 種別 | サービス自前データ（運用データ） |
| 保存先 | `data/corpus.db`（Corpus と同一ファイル） |
| アクセス | hub は `ctx.db`、Bot は better-sqlite3。構造的 IF `SqlDb` 経由 |
| 保護要否 | 暗号化不要（公開的な就活情報。投稿者は表示名のみ） |

## カラム定義（`glab_job`）

| カラム | 型 | 制約 / 既定 | 意味 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 主キー（`/job close` の引数） |
| `company` | TEXT | NOT NULL | 企業名 |
| `position` | TEXT | NULL 可 | 募集 / 職種 |
| `category` | TEXT | NULL 可 | 業種（例: ゲーム） |
| `url` | TEXT | NULL 可 | 募集 URL |
| `body` | TEXT | NULL 可 | 詳細本文 |
| `deadline_at` | INTEGER | NULL 可 | 締切日時（epoch ms）。NULL = 締切なし |
| `status` | TEXT | NOT NULL DEFAULT `'open'` | `open` / `closed` |
| `posted_by` | TEXT | NOT NULL | 投稿者表示名。hub は Cernere `userId`、Bot は `"<username> (discord)"` |
| `created_at` | INTEGER | NOT NULL | 投稿時刻（epoch ms） |
| `deadline_notified_at` | INTEGER | NULL 可 | 締切リマインド済み時刻。NULL = 未通知 |

## インデックス

```sql
CREATE INDEX IF NOT EXISTS glab_job_status ON glab_job(status, deadline_at);
```

`status='open'` の絞り込みと締切順ソート（`listJobs` / `jobsDueForReminder`）を支える複合インデックス。

## 主なクエリ（`plugins/data.ts`）

- `createJob(db, NewJob)` — INSERT。`status='open'` 固定、`created_at = Date.now()`。
- `listJobs(db, JobQuery)` — `JobQuery = { status?: 'open'|'closed'|'all'; category?; q? }`。既定 `status='open'`。
  `q` は `company / position / body` の LIKE 部分一致。ソートは「締切が近い順（NULL は末尾）→ 新しい順」。
- `getJob(db, id)` — 単件取得。
- `closeJob(db, id)` — `status='closed'` に UPDATE。
- `markJobDeadlineNotified(db, id)` — `deadline_notified_at = now`（二重通知防止）。
- `jobsDueForReminder(db, windowMs)` — `status='open' AND deadline_notified_at IS NULL AND deadline_at` が
  `now..now+windowMs` の求人を昇順。スケジューラ用。

## マイグレーション方針

`glab_event` と同様、`ensureSchema(db)` による冪等初期化。両プロセスのどちらが先に起動しても安全。
カラム追加は INDEX を ALTER の後に冪等発行（[`glab-event.md`](./glab-event.md) と同方針）。

## 関連

- 機能: [`feature/jobs.md`](../feature/jobs.md)（Web）/ [`feature/discord-job.md`](../feature/discord-job.md)（Bot）
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
