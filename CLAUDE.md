# GLAB — Claude 向けメモ

## 性格

学校組織 GLAB（Vantan Game Academy のゲーム制作ラボ）の運営 hub。
[Corpus](https://github.com/LUDIARS/Corpus)（汎用 hub フレームワーク）を submodule で取り込み、
GLAB 特化のプラグインパック（`plugins/`）と Discord 通知 Bot（`bot/`）を載せた派生 hub。
リポジトリは VGA-GLAB org に置く。

## 触ってよい / よくない

- 触ってよい：`plugins/`, `public/`, `bot/`, `server.ts`, `scripts/`, `tsconfig*`, `package.json`, `*.md`
- **`corpus/`（submodule）は触らない** — Corpus 本体の変更は LUDIARS/Corpus 側で PR を出し、
  ここでは submodule pointer を更新する
- DB schema 変更は `plugins/data.ts` に集約（hub と Bot の齟齬を防ぐ）。
  migration 規約に従う（INDEX は ALTER の後、冪等）

## アーキ要点

- Web hub と Discord Bot の **2 ランタイム**。両者が `data/corpus.db` を WAL 共有する
- 各モジュールは `plugins/<id>/index.ts` から `CorpusModule` を default export
- **プラグインのランタイム import は必ず `corpus/server/hub/sdk.ts` 経由**（hono 二重ロード回避）。
  `hono` を直接 import しない
- **frontend の外殻は GLab 自前**（`public/`、`CORPUS_PUBLIC_DIR` で Corpus に渡す）。
  Corpus のトップページは Cernere composite ログインだけの汎用シェルなので、名乗り・
  シェル・スタイルは派生 hub 側が持つ。表示名は `public/src/branding.ts` と
  `public/index.html` の `<title>` の 2 箇所
- **サーバ側の名乗りは `server.ts` の `CORPUS_DISPLAY_NAME`**（= `GLab-Hub`）。
  マニフェストの `displayName` と、ステータスタブ「ローカル (この PC のサービス)」に
  出る自己コネクタの表示名の両方がこの env を見る（Corpus `SelfConnector`）
- **認証の配置モードは `CORPUS_AUTH_MODE`**（= `composite`、`server.ts` で固定する）。
  Corpus は未設定だと起動を拒否する（無言フォールバック禁止、Corpus DESIGN §16.1）ので、
  corpus submodule を bump したあとにこの手の必須 env が増えていないか確認する
- 汎用機構（`api.ts` / `cernere-login.tsx` / declarative renderer）は `corpus/public/src/`
  から import して共有する。React は esbuild の `--alias` で corpus 側の 1 コピーに固定
  （二重ロードで hooks が壊れるのを防ぐ）
- パネル（frontend）は `plugins/<id>/panel.ts` → esbuild で `panel.js` にビルド
- 出席は `plugins/data.ts` の `glab_attendance` が正本（`glab_user` は user_id の参照行のみ保持）。
  施設は `HttpServiceConnector` で Aedilis に接続。イベント・就活も自前データ。
- Bot の設定は暗号化 config（`@ludiars/encrypted-config`）。token を平文で置かない

## モジュール追加 / 変更の流れ（Web hub）

1. `plugins/<id>/index.ts` + `plugins/<id>/panel.ts` を作る
2. `plugins/pack.json` の `modules` 配列に追加
3. `package.json` の `build:panels` に panel.ts を追加
4. `npm run typecheck` + `npm run build`

## Discord 入力境界

Discord は通知専用で、GLAB の利用者操作 command を追加しない。`bot/commands/registry.ts` は空配列を
global と設定済み guild へ同期する。同期前の残存 command は停止案内だけを返す。

## やらないこと

- Corpus 本体（`corpus/`）の改変
- 施設マスタの編集（Aedilis の領分）
- 名前・役職・学科の自前保管（Cernere `vantan_user` が単一情報源）
- token / API キーの平文保存（暗号化 config を使う）

## テスト方針

- v0.1 は手動：hub は `npm run dev` → ブラウザ → 認証 → 初回プロフィール登録 → 各タブ（施設は Aedilis 未稼働なら degraded 表示で OK）。
  Bot は空の command 登録、残存 Interaction の停止案内、通知配送を確認する
- 後で vitest で `plugins/data.ts` のクエリ最小ケースを書く

## 関連

- 雛形：VantanHub（同じ Corpus プラグインパック方式）
- 流用元：Aedilis（施設 API）、
  Discutere、@ludiars/encrypted-config（暗号化 config）
