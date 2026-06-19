# setup/ — Web hub の立ち上げ

GLAB Web hub は Corpus（submodule `corpus/`）の汎用 hub フレームワークに GLAB プラグインパック
（`plugins/`）を載せた派生 hub。`server.ts` が Corpus を「GLAB パック付き」で起動する薄いランチャ。

## 前提

- Node.js（`@types/node` ^20）+ npm。
- submodule `corpus`（`https://github.com/LUDIARS/Corpus`）を取得済みであること。
- ビルドツール: `esbuild`（panel バンドル）, `typescript` / `tsx`。

## 取得・起動（README より）

```bash
git clone --recurse-submodules <this-repo>
npm install
npm --prefix corpus install
cp .env.example .env        # CERNERE_BASE_URL / AEDILIS_BASE_URL 等を埋める
npm run dev                 # http://localhost:5187
```

## npm スクリプト（`package.json`）

| script | 内容 |
|---|---|
| `build:corpus-web` | `npm --prefix corpus run build:web` |
| `build:panels` | esbuild で `plugins/{attendance,facility,events,jobs}/panel.ts` → `panel.js`（ESM, es2020） |
| `build` | corpus-web + panels |
| `dev` | `tsx watch ... server.ts`（`predev` で build）。port 5187 |
| `start` | `tsx ... server.ts`（`prestart` で build） |
| `typecheck` | `tsc --noEmit -p tsconfig.json && -p tsconfig.frontend.json` |
| `bot` | `npm --prefix bot run start`（Bot 起動の委譲） |
| `env:*` | Cernere env-cli（Infisical）連携（`env:setup/gen/list/set/get/test/initialize`） |

`server.ts` は環境変数で Corpus に所在を伝える：`CORPUS_PLUGIN_DIR=plugins`,
`CORPUS_DATA=<root>/data`, `CORPUS_PUBLIC_DIR=corpus/public`, `CORPUS_PORT=5187`,
`CORPUS_SERVICE_ID=glab`, `CORPUS_DISPLAY_NAME=GLAB`（いずれも `??=` で上書き可）。

## モジュール追加の流れ（CLAUDE.md）

1. `plugins/<id>/index.ts` + `panel.ts` を作る（`index.ts` は `CorpusModule` を default export）。
2. `plugins/pack.json` の `modules` に追加。
3. `package.json` の `build:panels` に panel.ts を追加。
4. `npm run typecheck` + `npm run build`。

> プラグインのランタイム import は必ず `corpus/server/hub/sdk.ts` 経由（hono 二重ロード回避）。
> `hono` を直接 import しない。`corpus/`（submodule）は触らない。

## 関連

- 環境変数: [`setup/environment.md`](./environment.md)
- Bot 設定: [`setup/bot-encrypted-config.md`](./bot-encrypted-config.md)
