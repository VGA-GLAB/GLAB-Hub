# feature/ — Discord `/job` command (retired)

Discord の `/job add|list|close` は 2026-09-08 に GLAB の利用者操作入口から廃止した。
Discord 側に古い command が残っている間も、GLAB の画面を使う案内だけを返し、求人 DB は読み書きしない。

求人の投稿・検索・募集終了は GLAB の Web `jobs` 画面で行う。Bot は締切リマインドの通知だけを維持する。

旧 Discord 投稿は `posted_by = "<username> (discord)"`、Web は Cernere user ID で所有者を判定する。
既存求人を旧投稿者が Web で終了できない場合は当面管理者が対応する。アカウント名や名簿 Discord ID だけで
自動移行せず、正当な Cernere 連携に基づく所有者移行を別途設計する。

旧 handler `bot/commands/job.ts` は到達不能な移行用ソースとして残るが、registry への登録と dispatch はない。

## Related

- Web feature: [`jobs.md`](./jobs.md)
- Data: [`../data/glab-job.md`](../data/glab-job.md)
- Discord boundary: [`../interface/discord-commands.md`](../interface/discord-commands.md)
