# interface/ — corpus.db WAL 共有（hub ↔ Bot）

Web hub（Corpus + `plugins/`）と Discord Bot（`bot/`）の **2 ランタイム**が、同じ SQLite ファイル
`data/corpus.db`（WAL）を共有することで、Web で登録したイベント / 就活を Bot が通知し、Bot で投稿した
ものを Web で閲覧できる（DESIGN §4）。これはプロセス間の暗黙の「接点」であり、ここで contract を固定する。

## 共有の取り決め

- **スキーマ正本は `plugins/data.ts`**（`glab_user` + `GLAB_SCHEMA` + 型 `EventRow`/`JobRow` + クエリ関数）。
  hub と Bot は同じファイルを import し、齟齬を出さない。
- DB は構造的インターフェース `SqlDb`（`prepare` / `exec`）で受ける。CorpusDb（`ctx.db`）と
  better-sqlite3（Bot）の両方がこれを満たす → **import 結合を避ける**。
- 初期化は `ensureSchema(db)` が冪等（`CREATE TABLE/INDEX IF NOT EXISTS`）。
  hub プラグイン `setup()` と Bot の `openSharedDb()` の**どちらが先に起動しても安全**。

## 接続（`bot/db.ts` の `openSharedDb`）

```
new Database(dbPath)
  → pragma journal_mode = WAL
  → pragma busy_timeout = 5000
  → ensureSchema(db)
```

- WAL により複数プロセスの read/write を安全に捌く。`busy_timeout=5000` で競合を待つ。
- **稼働中 DB を `cp` で差し替えると破損する**（WAL の `-shm`/`-wal` busy = 生接続の合図）。
  反映は SQLite 書込経由のみ（[[feedback_sqlite_cp_while_open]]）。
- `dbPath` 既定は `bot/` から見た `../data/corpus.db`（`GLAB_DB_PATH` で上書き可）。
  hub 側は `server.ts` が `CORPUS_DATA=<root>/data` を渡す。

## 二重通知防止

- イベント: `notified_at`（+ `discord_message_id`）。Web 登録分も Bot が拾い、通知済みにマークする。
- 就活締切: `deadline_notified_at`。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md) / [`data/glab-job.md`](../data/glab-job.md)
- 機能: [`feature/events.md`](../feature/events.md) / [`feature/jobs.md`](../feature/jobs.md)
