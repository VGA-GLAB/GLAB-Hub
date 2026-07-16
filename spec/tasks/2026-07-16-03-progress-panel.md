---
task: 03-progress-panel
project: GLAB
kind: 実装
status: pending
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

## スコープ (編集可ディレクトリ)

- plugins/progress/ (新設) または plugins/projects/
- plugins/status/
- plugins/pack.json
- package.json (build:panels)
- spec/interface/
- tests/
- (corpus/ submodule は変更禁止)
