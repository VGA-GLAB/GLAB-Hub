# feature/ — イベント管理（Web hub `events`）

## 目的・ユーザーストーリー

GLAB の集会 / 勉強会 / 締切などの**イベントを Web hub で登録・一覧・削除**する。
登録されたイベントは Discord Bot が同じ DB を読んで `#event` へ通知・リマインドする
（[`feature/discord-event.md`](./discord-event.md)、DESIGN §4）。これは GLAB **自前データ**機能。

## 振る舞い（入力 → 処理 → 出力）

`plugins/events/index.ts` が登録する hub ルート（プラグインルート配下）：

| メソッド・パス | 認可 | 振る舞い |
|---|---|---|
| `GET /`（`?all=1` で過去含む） | 認証ユーザ | `listEvents` を `eventView` 整形して `{ events: [...] }` |
| `POST /` | 認証ユーザ | `{title, startsAt, body?, location?}` を検証して `createEvent`。`createdBy = userId` |
| `DELETE /:id` | 登録者 or admin | `getEvent` で存在確認 → 権限確認 → `deleteEvent` |

- `title` 空は `422 title_required`、`startsAt` 不正は `422 starts_at_required`。
- `startsAt` は数値（epoch ms）または ISO 文字列（`Date.parse`）を受ける。
- 登録時に `cacheDisplayName(db, userId, displayName)` で表示名をキャッシュする。

## 状態

`notified_at` は Web からの登録では未設定（NULL）。実際の Discord 通知 / リマインドは Bot 側が
行い、`notified_at` / `discord_message_id` を埋める。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
- 対の Bot 機能: [`feature/discord-event.md`](./discord-event.md)
