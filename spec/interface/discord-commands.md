# interface/ — Discord notification contract

GLAB Discord Bot（`bot/`）は、GLAB から Discord へ通知する片方向の運用境界である。
Discord の利用者操作を GLAB の DB、LLM、API へ中継しない。

## Transport / input boundary

- Transport は discord.js Gateway、intent は `Guilds` のみ。
- `bot/commands/registry.ts` の `ALL_COMMANDS` は空である。REST 同期は global commands を常に空にし、
  `DISCORD_GUILD_ID` が設定されていればその guild commands も空にする。
- 同期前に Discord 側へ残る Chat Input Interaction は `bot/commands/disabled-interaction.ts` が
  ephemeral の停止案内だけを返す。DB 書込、LLM、GLAB API は呼ばない。
- Button / Modal の入力 handler は登録しない。
- 利用者は現在 GLAB の Web 画面から操作する。desktop は今後の主経路として準備中である。

## Command deletion migration

`npm --prefix bot run register` は Bot を起動せず、空の command 一覧を同期できる。この変更の
commit / PR だけでは Discord 側の登録は変わらないため、反映担当者が次を行う。

1. 過去に使った guild ID を `DISCORD_GUILD_ID` に明示して `npm --prefix bot run register` を実行する。
   この 1 回で global と指定 guild を空同期する。片方の scope が失敗しても、もう片方の削除は試みる。
   失敗した scope があれば `register` は非 0 終了する（成功と誤認したまま旧 command を残さない）。
2. 複数 guild へ登録した履歴があれば、各 ID について繰り返す。env を空にすると暗号化 config の値へ
   フォールバックするため、対象 ID は明示する。
3. Discord Developer Portal または REST 取得で、global と過去に使った全 guild が 0 件か確認する。
   global command の表示消失には時間差があり得る。

## Retained sources

`bot/commands/{event,job,chat,orehima}.ts` と `bot/llm/` は到達不能な移行用ソースとして残る。
`registry.ts` から import しないことを `tests/discord-input-boundary.test.ts` が固定する。
これらを対象にした既存の契約テスト（例: `events-contract.test.ts` の audience 規則）は、
再導入時の安全網として維持する。

## Notifications and acknowledgements

- イベント → `GLAB_EVENT_CHANNEL_ID`、求人 → `GLAB_JOB_CHANNEL_ID`。
- 5分クエスト / スポットライト → `GLAB_DAILY_CHANNEL_ID`。未設定時は
  `GLAB_EVENT_CHANNEL_ID` を使い、どちらも無ければ日次通知を無効にする。
- 感想、フォーラム、相談等の通知も scheduler が処理する。
- Discord の message ID を得た後の通知済み更新や external API ACK は、利用者入力ではなく
  GLAB→Discord 配信の台帳処理である。
- 相談通知は service token が Corpus の共通 `requireAuth` を通れず 401 になる既知不整合が残る。
  Discord 入力廃止は全通知の正常動作を保証しない。

## Related

- Retired inputs: [`feature/discord-event.md`](../feature/discord-event.md) /
  [`discord-job.md`](../feature/discord-job.md) / [`discord-chat.md`](../feature/discord-chat.md)
- Notifications: [`feature/daily-engagement.md`](../feature/daily-engagement.md)
- Migration log: [`plan/problem_logs/2026-09-08-discord-input-retirement.md`](../plan/problem_logs/2026-09-08-discord-input-retirement.md)
- Configuration: [`setup/environment.md`](../setup/environment.md)
