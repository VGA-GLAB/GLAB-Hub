# data/ — `glab_event` テーブル

GLAB 自前のイベント（集会 / 勉強会 / 締切リマインド対象）を保持するテーブル。
スキーマ正本は [`plugins/data.ts`](../../plugins/data.ts) の `GLAB_SCHEMA`。Web hub
プラグイン（`plugins/events`）と Discord Bot（`bot/`）が同じ `data/corpus.db`（SQLite, WAL）を
共有して読み書きする（[DESIGN.md](../../DESIGN.md) §4）。

## 種別・保存先

| 項目 | 内容 |
|---|---|
| 種別 | サービス自前データ（運用データ）。個人データではない |
| 保存先 | `data/corpus.db`（Corpus と同一ファイル、`.gitignore` 済の `data/`） |
| アクセス | hub は `ctx.db`（CorpusDb）、Bot は better-sqlite3。両者とも構造的 IF `SqlDb` 経由 |
| 保護要否 | 暗号化不要（学校運営の公開的イベント情報。氏名は Discord username か Cernere displayName 由来の表示名のみ） |

## カラム定義（`glab_event`）

| カラム | 型 | 制約 / 既定 | 意味 |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 主キー |
| `title` | TEXT | NOT NULL | イベント名 |
| `body` | TEXT | NULL 可 | 詳細本文 |
| `location` | TEXT | NULL 可 | 開催場所 |
| `starts_at` | INTEGER | NOT NULL | 開始日時（epoch ms） |
| `created_by` | TEXT | NOT NULL | 登録者表示名。hub は Cernere `userId`、Bot は `"<username> (discord)"` |
| `created_at` | INTEGER | NOT NULL | 登録時刻（epoch ms、`Date.now()`） |
| `notified_at` | INTEGER | NULL 可 | Discord 通知済み時刻（epoch ms）。NULL = 未通知 |
| `discord_message_id` | TEXT | NULL 可 | 通知投稿の Discord メッセージ ID |

## インデックス

```sql
CREATE INDEX IF NOT EXISTS glab_event_starts ON glab_event(starts_at);
```

開始日時順の一覧（`listEvents`）とリマインダ窓検索（`eventsDueForReminder`）を支える。

## 主なクエリ（`plugins/data.ts`）

- `createEvent(db, NewEvent)` — INSERT。`created_at = Date.now()`、`notified_at` / `discord_message_id` は未設定（NULL）。
- `listEvents(db, includePast=false)` — 既定は `starts_at >= now` を昇順。`includePast=true` で全件降順。
- `getEvent(db, id)` / `deleteEvent(db, id)` — 単件取得 / 削除。
- `markEventNotified(db, id, discordMessageId)` — `notified_at = now` と `discord_message_id` を更新（二重通知防止）。
- `eventsDueForReminder(db, windowMs)` — `notified_at IS NULL AND now <= starts_at <= now+windowMs` を昇順。スケジューラ用。

## マイグレーション方針

- スキーマは `ensureSchema(db)` が `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` を 1 回 exec する**冪等**初期化。
- hub プラグインの `setup()`（`events` / `jobs`）と Bot の `openSharedDb()` がそれぞれ呼ぶため、**どちらのプロセスが先に起動しても安全**。
- カラム追加時は [`RULE.md`](../../../AIFormat/RULE.md) §2 と
  [[feedback_sqlite_create_index_after_alter]] に従い、**INDEX は ALTER ADD COLUMN の後**に冪等発行する（既存 DB で「no such column」を避ける）。

## 関連

- 機能: [`feature/events.md`](../feature/events.md)（Web）/ [`feature/discord-event.md`](../feature/discord-event.md)（Bot）
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
