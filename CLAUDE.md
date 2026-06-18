# GLAB — Claude 向けメモ

## 性格

学校組織 GLAB（Vantan Game Academy のゲーム制作ラボ）の運営 hub。
[Corpus](https://github.com/LUDIARS/Corpus)（汎用 hub フレームワーク）を submodule で取り込み、
GLAB 特化のプラグインパック（`plugins/`）と Discord Bot（`bot/`）を載せた派生 hub。
リポジトリは VGA-GLAB org に置く。

## 触ってよい / よくない

- 触ってよい：`plugins/`, `bot/`, `server.ts`, `tsconfig*`, `package.json`, `*.md`
- **`corpus/`（submodule）は触らない** — Corpus 本体の変更は LUDIARS/Corpus 側で PR を出し、
  ここでは submodule pointer を更新する
- DB schema 変更は `plugins/data.ts` に集約（hub と Bot の齟齬を防ぐ）。
  migration 規約に従う（INDEX は ALTER の後、冪等）

## アーキ要点

- Web hub と Discord Bot の **2 ランタイム**。両者が `data/corpus.db` を WAL 共有する
- 各モジュールは `plugins/<id>/index.ts` から `CorpusModule` を default export
- **プラグインのランタイム import は必ず `corpus/server/hub/sdk.ts` 経由**（hono 二重ロード回避）。
  `hono` を直接 import しない
- パネル（frontend）は `plugins/<id>/panel.ts` → esbuild で `panel.js` にビルド
- 出席・施設は `HttpServiceConnector` で Aedilis に接続（自前データを持たない）。
  イベント・就活は自前データ（`plugins/data.ts`）
- Bot の設定は暗号化 config（`@ludiars/encrypted-config`）。token を平文で置かない

## モジュール追加 / 変更の流れ（Web hub）

1. `plugins/<id>/index.ts` + `plugins/<id>/panel.ts` を作る
2. `plugins/pack.json` の `modules` 配列に追加
3. `package.json` の `build:panels` に panel.ts を追加
4. `npm run typecheck` + `npm run build`

## Discord コマンド追加の流れ

1. `bot/commands/<name>.ts` に `BotCommand`（`data` = SlashCommandBuilder().toJSON()、`handle`）を作る
2. `bot/commands/registry.ts` の `ALL_COMMANDS` に追加
3. `npm --prefix bot run typecheck`、起動時 or `npm --prefix bot run register` で反映

## やらないこと

- Corpus 本体（`corpus/`）の改変
- 施設マスタ / 出席記録そのものの編集（Aedilis の領分）
- 個人データの自前保管（Cernere 単一情報源）
- token / API キーの平文保存（暗号化 config を使う）

## テスト方針

- v0.1 は手動：hub は `npm run dev` → ブラウザ → 認証 → 各タブ（Aedilis 未稼働なら degraded 表示で OK）。
  Bot は `config-setup` 後 `npm run start` → Discord で `/event` `/job` `/chat`
- 後で vitest で `plugins/data.ts` のクエリ最小ケースを書く

## 関連

- 雛形：VantanHub（同じ Corpus プラグインパック方式）
- 流用元：Aedilis（出席/施設 API）、Ostiarius（passkey チェックイン）、
  Discutere（LLM backend 抽象）、@ludiars/encrypted-config（暗号化 config）
