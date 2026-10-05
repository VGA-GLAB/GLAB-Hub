# setup/ — Discord Bot と暗号化 config

Discord 通知 Bot（`bot/`）は hub とは**別プロセス・別 package**。token / API キー / チャンネル ID は
**暗号化 config**（`@ludiars/encrypted-config`、AES-256-GCM + scrypt）に保存し、平文 JSON を置かない
（DESIGN §6）。

## 前提・インストール（README より）

```bash
cd bot
npm install                 # @ludiars/encrypted-config は GitHub Packages 認証が要る
                            # （NODE_AUTH_TOKEN = read:packages 付き PAT）
npm run config-setup        # 対話で各キーを暗号化保存 → glab-bot.config.json
npm run start               # Gateway 接続 + slash command 削除同期 + 通知開始
```

- `bot/.npmrc`: `@ludiars:registry=https://npm.pkg.github.com` +
  `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`。
- 依存: `discord.js` ^14.26, `better-sqlite3` ^12.6, `@ludiars/encrypted-config` 0.1.0, `tsx`。

## 暗号化 config（`bot/config-store.ts`）

| 項目 | 値 |
|---|---|
| 保存先 | `bot/glab-bot.config.json`（cwd 直下、**gitignore 済**）。env `GLAB_BOT_CONFIG_PATH` で上書き |
| 暗号化キー（`GLAB_BOT_SECRET_KEYS`） | `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, `GLAB_DATABASE_URL`, `GLAB_PROJECTS_SERVICE_TOKEN` |
| 全キー（`GLAB_BOT_CONFIG_KEYS`） | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `GLAB_DATABASE_URL`, `GLAB_EVENT_CHANNEL_ID`, `GLAB_JOB_CHANNEL_ID`, `GLAB_REVIEW_CHANNEL_ID`, `GLAB_FORUM_CHANNEL_ID`, `GLAB_CONSULT_FORUM_CHANNEL_ID`, `GLAB_DAILY_CHANNEL_ID`, `GLAB_DAILY_NOTIFY_AT`, `GLAB_BASE_URL`, `GLAB_PROJECTS_SERVICE_TOKEN`, `GLAB_ADMIN_USER_IDS`, `GLAB_LLM_BACKEND`, `GLAB_LLM_MODEL`, `ANTHROPIC_API_KEY` |
| master 鍵 | env `GLAB_BOT_MASTER_KEY` → 無ければマシン束縛値 `glab-bot:<hostname>:<user>`（`masterSecretPrefix: 'glab-bot'`） |

**マシンごとに `npm run config-setup` を実行する**（束縛鍵はマシン固有のため、config を別マシンへコピー
しても復号できない）。`config-setup`（`bot/config-setup.ts`）は各キーを対話入力、Enter で既存値維持。

## 設定の読込順（`bot/config.ts` の `loadConfig`）

**env > 暗号化 config > コード既定** の優先で解決する（`pick()` / `pickNum()`）。CI / 一時上書きは env で。

## GLAB external API の認可（認証集約 P4）

Bot は hub の `/api/x/consult/external/*` を呼ぶとき、Cernere service token
（`target_project_key = EducationLab`、hub 側 scope `glab-external:write`）を
`X-Glab-Service-Token` で送る（`bot/glab-api.ts`、発行とキャッシュは `plugins/cernere-service-token.ts`）。

- 発行に使う `CERNERE_BASE_URL` / `CERNERE_PROJECT_CLIENT_ID` / `CERNERE_PROJECT_CLIENT_SECRET` は
  **env からだけ渡す**（`config-setup` の対象キーにしない）。Excubitor の `cernere_launch_credentials` は
  起動ごとに secret を rotate するため、暗号化 config に固定保存すると次回起動で失効する。
- 発行に失敗したとき（credentials 未設定 / 401 / 403 / 404 / 通信失敗）だけ、従来の
  `GLAB_PROJECTS_SERVICE_TOKEN` を同じヘッダで送る（P5 で撤去）。どちらも無ければ hub を呼ばない。
- Bot は Excubitor catalog に載っていないため、現状 credentials を注入する経路が無い。
  hub と同じ `EducationLab` の launch credential を共有すると hub の secret が rotate されて失効するので、
  Bot 用の Cernere project（`service_scopes` に `glab-external:write`）と catalog 登録が別途必要（未決）。

## npm スクリプト（`bot/package.json`）

| script | 内容 |
|---|---|
| `start` | `tsx ... index.ts`（Gateway 接続 + 登録 + スケジューラ） |
| `dev` | `tsx watch ... index.ts` |
| `config-setup` | 暗号化 config 対話登録 |
| `register` | 空の slash command 一覧を同期（Bot 起動なし）。global は常に、設定済み guild も削除対象 |
| `typecheck` | `tsc --noEmit` |

`GLAB_ADMIN_USER_IDS` と LLM 関連キーは旧 command 用の互換設定として残るが、現行の通知 runtime は
利用しない。過去に複数 guild へ command を登録した場合の削除手順は
[`interface/discord-commands.md`](../interface/discord-commands.md)を参照する。

## 関連

- 環境変数の一覧: [`setup/environment.md`](./environment.md)
- 別マシンでの立ち上げ: [`setup/new-machine.md`](./new-machine.md)
- 接点: [`interface/discord-commands.md`](../interface/discord-commands.md)
