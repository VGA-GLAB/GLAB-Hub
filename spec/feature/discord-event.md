# feature/ — Discord `/event` command (retired)

Discord の `/event` は 2026-09-08 に GLAB の利用者操作入口から廃止した。
新規登録も一覧取得も実行せず、Discord 側に古い command が残っている間は GLAB の画面を使う案内だけを返す。

イベントの登録・確認は GLAB の Web `events` 画面で行う。Bot は GLAB で登録されたイベントを読み、
Discord へリマインドする通知処理だけを維持する。

旧 handler `bot/commands/event.ts` は到達不能な移行用ソースとして残るが、registry への登録と dispatch はない。

## Related

- Web feature: [`events.md`](./events.md)
- Discord boundary: [`../interface/discord-commands.md`](../interface/discord-commands.md)
