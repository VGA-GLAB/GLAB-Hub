# interface/ — Discord slash command contract

GLAB Discord Bot（`bot/`）が外部に公開する境界は **Discord slash command** のみ。
discord.js Gateway（常時接続）で受け、公開 URL / Interactions Endpoint は持たない。

## Transport / 認証

- **Transport**: discord.js Gateway。intents は `Guilds` のみ（`bot/index.ts`）。
- **コマンド登録**: REST（`bot/commands/registry.ts`）。`DISCORD_GUILD_ID` 指定時はギルドへ即時、
  無ければ global（反映に最大 1h）。起動時自動 + `npm run register` 単発。
- **認証**: Discord ユーザがそのまま行為主体。v0.1 では Cernere との突合はしない（DESIGN §7）。
  admin 判定は `adminUserIds`（`GLAB_ADMIN_USER_IDS`、Discord ユーザ ID のカンマ区切り）。

## コマンド定義（`bot/commands/registry.ts` の `ALL_COMMANDS`）

`data` は `SlashCommandBuilder().toJSON()`、`handle(interaction, deps)` で処理。

### `/event`（`bot/commands/event.ts`）
- `add` — `title*`, `when*`, `location`, `desc`（すべて string）。登録 → `#event` 通知。
- `list` — オプションなし。今後のイベント最大 10 件（ephemeral）。

### `/job`（`bot/commands/job.ts`）
- `add` — `company*`, `position`, `category`, `url`, `deadline`, `desc`（string）。投稿 → `#job` 通知。
- `list` — `q`, `category`（string）。`status='open'` を最大 8 件（ephemeral）。
- `close` — `id*`（**integer**）。投稿者 or admin のみ。

### `/chat`（`bot/commands/chat.ts`）
- `message*`（string）, `reset`（boolean）。LLM 応答（deferReply → editReply）。

（`*` = required。返信はいずれも ephemeral、通知本体のみ公開チャンネル）

## 出力（チャンネル投稿）

- イベント通知 → `GLAB_EVENT_CHANNEL_ID`、就活通知 → `GLAB_JOB_CHANNEL_ID`。
- 投稿は `bot/channels.ts` の `postToChannel`（text-based チャンネルへ `send`、メッセージ ID 返却）。
  未設定 / 失敗時は `null`（best-effort、握りつぶす）。
- カード整形は `bot/format.ts`（`formatEventCard` / `formatJobCard`）。日時パースは `parseDateInput`
  （`YYYY-MM-DD HH:mm` / `YYYY/MM/DD` / ISO を epoch ms に）。

## 通知スケジューラ（`bot/notify/scheduler.ts`）

`setInterval`（既定 `GLAB_REMINDER_INTERVAL_MS=300000`）で `eventsDueForReminder` /
`jobsDueForReminder` をポーリングし `#event` / `#job` へリマインド投稿。Web 登録分も拾う。
二重投稿は `notified_at` / `deadline_notified_at` で防止。

## 関連

- 機能: [`feature/discord-event.md`](../feature/discord-event.md) / [`discord-job.md`](../feature/discord-job.md) / [`discord-chat.md`](../feature/discord-chat.md)
- 設定: [`setup/environment.md`](../setup/environment.md)
