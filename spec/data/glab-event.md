# data/ — `glab_event` テーブル

GLAB所有のイベントを保持するPostgreSQLテーブル。スキーマとクエリの正本は
[`plugins/events/store.ts`](../../plugins/events/store.ts)。Web hubとDiscord Botが
`GLAB_DATABASE_URL`で同じストアへ接続する。

## 境界

| 項目 | 内容 |
|---|---|
| 種別 | GLABサービス自前の運用データ |
| 保存先 | GLAB専用PostgreSQL database |
| 施設表示 | `glab_facility` のID・表示名をGLAB自身が保持。Aedilis一覧は未登録候補にだけ使用 |
| 旧データ | 旧SQLite `glab_event` の移行は不要（レガシーデータ無しの判断で移行処理は撤去済み） |

## カラム

| カラム | PostgreSQL型 | 意味 |
|---|---|---|
| `id` | INTEGER IDENTITY | 主キー |
| `title` | TEXT NOT NULL | イベント名 |
| `body` | TEXT | 詳細 |
| `location` | TEXT | 場所表示 |
| `starts_at` | TIMESTAMPTZ NOT NULL | 開始時刻 |
| `ends_at` | TIMESTAMPTZ | 終了時刻。Web登録では必須 |
| `facility_id` | TEXT | GLAB施設マスタID |
| `reservation_id` | TEXT | 対応するAedilis予約ID |
| `created_by` | TEXT NOT NULL | Cernere user ID |
| `created_at` | TIMESTAMPTZ NOT NULL | 登録時刻 |
| `notified_at` | TIMESTAMPTZ | Discord通知時刻（`recurrence='weekly'` では使わない） |
| `discord_message_id` | TEXT | Discord message ID |
| `audience_roles` | TEXT | 閲覧できる役職キーのJSON配列。NULL / `[]` は全員公開 |
| `recurrence` | TEXT NOT NULL DEFAULT `'none'` | `none` または `weekly` |

`glab_event_starts` indexが一覧、進行中イベント判定、リマインダ窓検索を支える。

## `glab_event_occurrence_notified`

週次イベントの「どの回まで通知したか」を持つ。`(event_id, occurrence_date)` が主キーで、
`occurrence_date` は occurrence 開始日（ローカル日付）、ほかに `notified_at`、`discord_message_id` を持つ。
元イベント削除時に同じ `event_id` の行も消す（id 再利用で新イベントの初回通知が抑止されるのを防ぐ）。

## 整合性

- Web登録はGLAB施設ID・開始・終了を必須とする。
- 作成はAedilis予約成功後、削除はAedilis予約取消後にGLABへ反映する。
- Discord `/event` はGLAB PostgreSQLの一覧だけを提供する。
- 出席は `starts_at <= now < ends_at` のイベントがある時だけ有効になる。

## `glab_facility`

イベント参照用のGLAB施設マスタ。`id`、`display_name`、`aedilis_facility_id`、作成・更新時刻を持つ。
Aedilis候補は一覧表示だけでは保存せず、イベントで初めて選択された時に昇格する。

## 関連

- [`feature/events.md`](../feature/events.md)
- [`feature/attendance.md`](../feature/attendance.md)
- [`setup/environment.md`](../setup/environment.md)
