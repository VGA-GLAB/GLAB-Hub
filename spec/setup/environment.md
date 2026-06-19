# setup/ — 環境変数・シークレット一覧

GLAB は 2 系統の設定を持つ：**hub** は Infisical（env-cli）/ `.env`、**Bot** は暗号化 config
（[`bot-encrypted-config.md`](./bot-encrypted-config.md)）。token / API キーは平文 JSON に置かない。

## Web hub（`.env` / Infisical、`env-cli.config.ts` / `.env.example`）

| 変数 | 既定 | 必須（production） | 意味 |
|---|---|---|---|
| `CERNERE_BASE_URL` | `http://localhost:8080` | ○ | Cernere 認証（PASETO V4） |
| `CORPUS_PUBLIC_URL` | `http://localhost:5187` | ○ | 自身の public URL（PASETO audience） |
| `CORPUS_ADMIN_IDS` | （空） | ○ | admin の Cernere sub claim（カンマ区切り） |
| `CORPUS_PORT` | `5187` | | listen port（VantanHub 5186 の次） |
| `CORPUS_MODE` | `server` | | Corpus 動作モード |
| `CORPUS_TOKEN_MODE` | `passthrough` | | トークン透過モード |
| `CORPUS_SERVICE_ID` | `glab` | | サービス識別（マニフェスト / project key） |
| `CORPUS_DISPLAY_NAME` | `GLAB` | | 表示名 |
| `AEDILIS_BASE_URL` | （空 = degraded） | | 出席 / 施設の集約先 Aedilis |
| `AEDILIS_SERVICE_TOKEN` | （任意） | | Aedilis 連携のサービス間 Bearer（未設定ならユーザ Bearer 透過） |

Infisical bootstrap は `.env.secrets`（`INFISICAL_SITE_URL` / `PROJECT_ID` / `ENVIRONMENT` /
`CLIENT_ID` / `CLIENT_SECRET`）。`npm run env:setup` → `env:gen` で `.env` を生成。

## Discord Bot（暗号化 config or env、`bot/config.ts`）

| 変数 | 既定 | 暗号化 | 意味 |
|---|---|---|---|
| `DISCORD_TOKEN` | — | ○ | Bot トークン（必須、未設定で起動中止） |
| `DISCORD_CLIENT_ID` | — | | アプリ（client）ID（command 登録に必要） |
| `DISCORD_GUILD_ID` | — | | 登録先ギルド。無いと global 登録（反映最大 1h） |
| `GLAB_DB_PATH` | `bot/../data/corpus.db` | | 共有 SQLite |
| `GLAB_EVENT_CHANNEL_ID` | — | | イベント通知先 |
| `GLAB_JOB_CHANNEL_ID` | — | | 就活通知先 |
| `GLAB_ADMIN_USER_IDS` | — | | admin の Discord ユーザ ID（カンマ区切り） |
| `GLAB_LLM_BACKEND` | `claude-cli` | | `claude-cli` / `anthropic` / `mock` |
| `GLAB_LLM_MODEL` | `claude-opus-4-8` | | LLM モデル |
| `ANTHROPIC_API_KEY` | — | ○ | backend=anthropic 時 |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | | API ベース URL |
| `GLAB_CLAUDE_CLI_PATH` | `claude` | | claude CLI パス |
| `GLAB_CLAUDE_CLI_TIMEOUT_MS` | `120000` | | CLI タイムアウト |
| `CLAUDE_CODE_GIT_BASH_PATH` | `C:\Program Files\Git\bin\bash.exe` | | claude CLI spawn に必須（Windows） |
| `GLAB_LLM_SYSTEM_PROMPT` | （既定文） | | system プロンプト |
| `GLAB_LLM_MAX_TOKENS` | `1024` | | 応答上限トークン |
| `GLAB_REMINDER_INTERVAL_MS` | `300000` | | スケジューラ周期 |
| `GLAB_EVENT_WINDOW_MS` | `86400000`（24h） | | イベントリマインド窓 |
| `GLAB_JOB_WINDOW_MS` | `259200000`（3 日） | | 就活締切リマインド窓 |
| `GLAB_BOT_MASTER_KEY` | （マシン束縛値） | | 暗号化 config の master 鍵 |
| `GLAB_BOT_CONFIG_PATH` | `bot/glab-bot.config.json` | | 暗号化 config の保存先 |

## gitignore（`.gitignore`）

`data/`, `logs/`, `.env`, `.env.secrets`, `.env.local`, `plugins/*/panel.js(.map)`,
`bot/glab-bot.config.json` は git 管理外。secret / 生成物はコミットしない。

## デプロイ / リリース

v0.1 はローカル起動運用（hub `npm run dev|start` + Bot `npm run start`）。専用のデプロイ
パイプラインは未整備。運用時の hub 設定は Infisical（env-cli）、Bot 設定はマシンごとの
`config-setup` で揃える。

## 関連

- hub: [`setup/hub.md`](./hub.md) / Bot: [`setup/bot-encrypted-config.md`](./bot-encrypted-config.md)
