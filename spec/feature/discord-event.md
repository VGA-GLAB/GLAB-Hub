# feature/ — Discord `/event` コマンド

## 目的・ユーザーストーリー

Discord 上で GLAB のイベントを**登録・一覧**し、登録時に即 `#event` チャンネルへ通知する。
登録分は Web hub の `events` モジュールと**同一 DB**を共有する（DESIGN §4）。

実装: `bot/commands/event.ts`（`SlashCommandBuilder` 定義 + `handle`）。

## サブコマンド・オプション

| サブコマンド | オプション | 必須 | 振る舞い |
|---|---|---|---|
| `/event add` | `title`（タイトル） | ○ | `parseDateInput(when)` → `createEvent` → `formatEventCard` を `#event` へ投稿 → `markEventNotified` |
| | `when`（日時, 例 `2026-07-01 19:00`） | ○ | |
| | `location`（場所） | | |
| | `desc`（詳細） | | |
| `/event list` | （なし） | | 今後のイベントを最大 10 件、ephemeral 表示 |

## 振る舞いの詳細

- `add`: `when` を解釈できない場合は ephemeral でエラー返信（登録しない）。
  `createdBy` は `"<username> (discord)"`。投稿成功時はメッセージ ID を `discord_message_id` に記録。
- 返信はすべて **ephemeral**（`MessageFlags.Ephemeral`）。通知本体だけが公開チャンネルに出る。

## 制約・前提

- `GLAB_EVENT_CHANNEL_ID` 未設定 / 投稿失敗時、通知は best-effort（`postToChannel` が `null` を返すだけ）。
- 締切が近いイベントの自動リマインドは通知スケジューラ（`bot/notify/scheduler.ts`）が別途行う。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md)
- 接点: [`interface/discord-commands.md`](../interface/discord-commands.md)
- 対の Web 機能: [`feature/events.md`](./events.md)
