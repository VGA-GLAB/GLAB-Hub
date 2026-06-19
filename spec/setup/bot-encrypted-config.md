# setup/ — Discord Bot と暗号化 config

Discord Bot（`bot/`）は hub とは**別プロセス・別 package**。token / API キー / チャンネル ID は
**暗号化 config**（`@ludiars/encrypted-config`、AES-256-GCM + scrypt）に保存し、平文 JSON を置かない
（DESIGN §6）。

## 前提・インストール（README より）

```bash
cd bot
npm install                 # @ludiars/encrypted-config は GitHub Packages 認証が要る
                            # （NODE_AUTH_TOKEN = read:packages 付き PAT）
npm run config-setup        # 対話で各キーを暗号化保存 → glab-bot.config.json
npm run start               # Gateway 接続 + slash command 登録 + リマインダ開始
```

- `bot/.npmrc`: `@ludiars:registry=https://npm.pkg.github.com` +
  `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`。
- 依存: `discord.js` ^14.26, `better-sqlite3` ^12.6, `@ludiars/encrypted-config` 0.1.0, `tsx`。

## 暗号化 config（`bot/config-store.ts`）

| 項目 | 値 |
|---|---|
| 保存先 | `bot/glab-bot.config.json`（cwd 直下、**gitignore 済**）。env `GLAB_BOT_CONFIG_PATH` で上書き |
| 暗号化キー（`GLAB_BOT_SECRET_KEYS`） | `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`（それ以外は平文保存） |
| 全キー（`GLAB_BOT_CONFIG_KEYS`） | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `GLAB_EVENT_CHANNEL_ID`, `GLAB_JOB_CHANNEL_ID`, `GLAB_ADMIN_USER_IDS`, `GLAB_LLM_BACKEND`, `GLAB_LLM_MODEL`, `ANTHROPIC_API_KEY` |
| master 鍵 | env `GLAB_BOT_MASTER_KEY` → 無ければマシン束縛値 `glab-bot:<hostname>:<user>`（`masterSecretPrefix: 'glab-bot'`） |

**マシンごとに `npm run config-setup` を実行する**（束縛鍵はマシン固有のため、config を別マシンへコピー
しても復号できない）。`config-setup`（`bot/config-setup.ts`）は各キーを対話入力、Enter で既存値維持。

## 設定の読込順（`bot/config.ts` の `loadConfig`）

**env > 暗号化 config > コード既定** の優先で解決する（`pick()` / `pickNum()`）。CI / 一時上書きは env で。

## npm スクリプト（`bot/package.json`）

| script | 内容 |
|---|---|
| `start` | `tsx ... index.ts`（Gateway 接続 + 登録 + スケジューラ） |
| `dev` | `tsx watch ... index.ts` |
| `config-setup` | 暗号化 config 対話登録 |
| `register` | slash command のみ登録（Bot 起動なし） |
| `typecheck` | `tsc --noEmit` |

## 関連

- 環境変数の一覧: [`setup/environment.md`](./environment.md)
- 接点: [`interface/discord-commands.md`](../interface/discord-commands.md)
