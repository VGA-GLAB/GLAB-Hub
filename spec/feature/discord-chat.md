# feature/ — Discord `/chat` command (retired)

Discord の `/chat` は 2026-09-08 に GLAB の利用者操作入口から廃止した。
registry への登録と dispatch はなく、Bot 起動時に LLM client を初期化しない。
Discord 側に古い command が残っている間も、GLAB の画面を使う案内だけを返して LLM は呼ばない。

旧 `bot/llm/` と `bot/commands/chat.ts` は到達不能な移行用ソースとして残る。
このため Claude CLI の出力上限問題は Discord の運用経路から解消するが、旧 CLI 部品自体の上限処理を
根治したものではない。

## Related

- Discord boundary: [`../interface/discord-commands.md`](../interface/discord-commands.md)
- Migration log: [`../plan/problem_logs/2026-09-08-discord-input-retirement.md`](../plan/problem_logs/2026-09-08-discord-input-retirement.md)
