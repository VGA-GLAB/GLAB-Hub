# feature/ — Discord `/chat` コマンド（LLM 対話）

## 目的・ユーザーストーリー

GLAB メンバーが Discord 上で**アシスタント（LLM）と会話**する。就活・制作・スケジュール・技術の
質問に簡潔な日本語で答える。実装: `bot/commands/chat.ts`。

## サブコマンド・オプション

`/chat`（サブコマンドなし）：

| オプション | 必須 | 意味 |
|---|---|---|
| `message` | ○ | LLM に送るメッセージ |
| `reset`（boolean） | | 会話履歴をリセットしてから送る |

## 振る舞い（入力 → 処理 → 出力）

- 履歴キーは `"<channelId>:<userId>"`。プロセス内メモリ保持（再起動で消える）。最大 `MAX_TURNS=8`
  ターン（user+assistant）まで保持。
- `interaction.deferReply()` → `LlmClient.invoke({ system, messages, model, maxTokens })` → `editReply`。
- 応答が Discord の 2000 文字制限を超える場合は 1900 文字で切って `…` を付す。
- 失敗時は `LLM 呼び出しに失敗しました: ...` を返す。

## LLM backend（`bot/llm/`）

`LlmClient` 抽象（`bot/llm/client.ts`）で backend を切替（`GLAB_LLM_BACKEND`）：

| backend | 実装 | 概要 |
|---|---|---|
| `claude-cli`（既定） | `claude-cli.ts` | `claude -p --output-format json --model <model>` を spawn、プロンプトは stdin。サブスク CLI で API キー不要。`CLAUDE_CODE_GIT_BASH_PATH` 必須（Windows） |
| `anthropic` | `anthropic.ts` | `POST {baseUrl}/v1/messages`（`x-api-key`, `anthropic-version: 2023-06-01`）。従量課金、`ANTHROPIC_API_KEY` 必須 |
| `mock` | `mock.ts` | テスト用 |

既定モデルは `claude-opus-4-8`、`maxTokens` 既定 1024（[`setup/environment.md`](../setup/environment.md)）。
`local`（OpenAI 互換）は follow-up（DESIGN §8）。

## 関連

- 接点: [`interface/discord-commands.md`](../interface/discord-commands.md)
- 設定: [`setup/environment.md`](../setup/environment.md)
