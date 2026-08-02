---
task: 03-progress-panel
project: GLAB
kind: 実装
status: in_review
created: 2026-07-16T00:00:00.000Z
source_session: lictor-9747bcfe-3969-4e12-959d-6cf39d3287fc
memoria_task_id: 536
actio_task_id: null
memory_links:
  - E:/Document/Ars/Calliope/docs/design/glab-pm.md
---
# progress パネル — Calliope 進捗/スプリントの表示面

## 目的

Calliope docs/design/glab-pm.md §H5 の実装。GLAB Hub に PJ ごとの進捗
(sprint health / burndown / risk / 停滞タスク) を表示するパネルを追加する。
エンジンは Calliope、GLAB は表示のみ (二重実装しない)。

前提: Calliope 側 `GET /api/glab/progress`
(Calliope/spec/tasks/2026-07-16-05-glab-sprint-progress.md) がマージ済みであること。
未マージなら着手せず報告する。

## 完了条件

- `plugins/progress/` (または projects パネル内タブ、実装時に UI 構成で判断) を
  CorpusModule 規約で追加し、`HttpServiceConnector` で Calliope
  `GET /api/glab/progress` を read して表示する。
- Calliope 未稼働・未設定時は degraded 表示 (施設パネルの Aedilis 未稼働時と同じ扱い)。
  データを自前 DB にキャッシュ保存しない。
- 接続契約 (URL env / token / レスポンス) を spec/interface/calliope-connector.md に記録。
- status プラグインの接続サービス一覧に Calliope の health を追加する。
- `npm run typecheck` / `npm run build` green。

## 実装メモ (2026-07-29)

- `plugins/progress/` を新設 (CorpusModule規約)。Calliope `/api/glab/progress` を
  静的 Bearer のコネクタ (`proxy()` は不使用) で read。
- 「status プラグインの接続サービス一覧」は Corpus 本体 (`registry.ts`) が
  `ctx.registerConnector()` 呼び出しだけで自動集約するため、追加ファイルなし。
  `plugins/status/` は作らない (`tests/navigation-contract.test.ts` が
  「組み込み overview を唯一の Status 面とする」を固定している)。

## 実装メモ (2026-07-31) — 検証と是正

前回コミットを main に rebase した上で、未達だった検証と 2 件の不具合を処置した。

- **検証**: `npm run typecheck` / `npm run build` / `npm test` すべて green。
  前回「環境課題で失敗する」としたのは worktree で `corpus/` 側の
  `npm install` が未実行だったため (`hono` 型が解決できず全プラグインが TS7006)。
  submodule 側の依存を入れれば通る。GLAB 本体チェックアウトでも green。
- **是正1 (未稼働時に 500)**: Calliope が「設定済みだが未稼働」のとき
  `connector.fetch()` が throw し、ハンドラが 500 を返していた。パネルは
  degraded ではなく「取得に失敗 (500)」になる。`relay.ts` で 502
  `connector_error` に写して degraded 表示に載るようにした。
- **是正2 (5秒でタイムアウト)**: Corpus 組み込み `HttpServiceConnector` は
  data 取得にも health 用の 5 秒タイムアウトを課す。`/api/glab/progress` は
  Calliope が GLAB/Actio/Memoria へ fan-out するため切れやすい。GLAB 他コネクタと
  同じ `VersionedHttpServiceConnector` に寄せ、固定ヘッダ対応を足した。
- SRP でファイル分割: `connector.ts` (設定) / `relay.ts` (中継) /
  `index.ts` (登録) / `panel.ts` (段取り) / `progress-view.ts` (描画)。
- `tests/progress-connector-contract.test.ts` を追加 (15 ケース)。

## スコープ (編集可ディレクトリ)

- plugins/progress/ (新設) または plugins/projects/
- plugins/status/
- plugins/pack.json
- package.json (build:panels)
- spec/interface/
- tests/
- (corpus/ submodule は変更禁止)
