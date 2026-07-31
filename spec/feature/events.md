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
| `GET /events`（`?all=1` で過去含む、`from` / `to` で期間指定） | 認証ユーザ | 閲覧権限のある GLAB イベントを `{ events: [...] }` で返す。`from`/`to` が日時として解釈できない、`to <= from`、期間が 366 日超のときは 400 `invalid_event_range` |
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

`starts_at <= now < ends_at` を満たすイベント（週次なら展開後の occurrence）だけが進行中イベントとなり、出席ボタンの対象になる。

`audience_roles` は役職キーの JSON 配列で、未指定なら全員に公開する。役職限定イベントは作成者・管理者・対象役職だけが閲覧でき、
Discord Bot の通知・`/event list` の対象外である。進行中イベントの提示（出席モジュールの `GET /availability`）と出席記録（`POST /checkin`）にも
同じ規則が効き、閲覧できないイベントは「進行中イベント無し」として扱う。

`recurrence` は `none` または `weekly`。週次イベントは単一の元イベントとして保存し、取得時に指定期間へ occurrence を展開する
（展開規則の正本は [`plugins/events/recurrence.ts`](../../plugins/events/recurrence.ts)。開始の曜日・時刻はローカル時刻で維持し、
`ends_at` は開始と同じ差分だけずらす）。通知済み状態は `glab_event_occurrence_notified` でイベントIDと発生日ごとに記録する。
`to` を省略した取得では `from`（未指定なら現在）から 365 日ぶんだけ展開する。

**未対応**: Aedilis 予約は登録時の 1 回ぶんしか作らないので、週次イベントの 2 回目以降は施設予約を伴わない。
削除は元イベントごと消す（1 occurrence だけの取り消しは未対応）。

Web パネルは今週 (日曜起点) と翌週の 2 つの週ビューを `from` / `to` 付きで取得して表示する。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
- 対の Bot 機能: [`feature/discord-event.md`](./discord-event.md)
