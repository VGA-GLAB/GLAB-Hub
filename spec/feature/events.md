# feature/ — イベント管理（Web hub `events`）

## 目的・ユーザーストーリー

GLAB の集会 / 勉強会などのイベントを **GLAB PostgreSQL** で登録・一覧・削除する。
登録されたイベントは Discord Bot が同じ DB を読んで `#event` へ通知・リマインドする
（[`feature/discord-event.md`](./discord-event.md)、DESIGN §4）。これは GLAB **自前データ**機能。

## 振る舞い（入力 → 処理 → 出力）

`plugins/events/index.ts` が登録する hub ルート（プラグインルート配下）：

| メソッド・パス | 認可 | 振る舞い |
|---|---|---|
| `GET /facilities` | 認証ユーザ | GLAB施設マスタと未登録のAedilis候補を分けて返す |
| `GET /events`（`?all=1` で過去含む） | 認証ユーザ | GLABイベントを `{ events: [...] }` で返す |
| `POST /events` | 認証ユーザ | Aedilis予約を作成してからGLABイベントを保存する |
| `DELETE /events/:id` | 登録者 or admin | Aedilis予約を取り消してからGLABイベントを削除する。予約が既に無い (404) 場合は続行、その他のキャンセル失敗は502 (`?force=1`でローカル削除を強行可) |

- `title` / `facilityId` は必須。`startsAt` / `endsAt` はepoch msまたはISO文字列を受け、`endsAt > startsAt`を必須とする。
- Web UIはGLAB施設とAedilis候補をselectで表示し、1〜8時間の使用時間から終了時刻を算出する。
- Aedilis候補を初めて使う時は、候補の名前と対応IDをGLAB施設マスタへ昇格する。
- Aedilis予約が失敗した場合はGLABイベントを作成しない。GLAB保存が失敗した場合は作成済み予約をbest-effortで取り消す。
- 登録時に `cacheDisplayName(db, userId, displayName)` で表示名をキャッシュする。

## 状態

`reservation_id` は対応するAedilis予約IDを保持する。`notified_at` は Web からの登録では未設定（NULL）。実際の Discord 通知 / リマインドは Bot 側が
行い、`notified_at` / `discord_message_id` を埋める。

`starts_at <= now < ends_at` を満たすイベントだけが進行中イベントとなり、出席ボタンの対象になる。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
- 対の Bot 機能: [`feature/discord-event.md`](./discord-event.md)
