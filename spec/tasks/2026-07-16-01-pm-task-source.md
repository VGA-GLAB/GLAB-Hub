---
task: 01-pm-task-source
project: GLAB
kind: 設計相談
status: pending
created: 2026-07-16T00:00:00.000Z
source_session: lictor-9747bcfe-3969-4e12-959d-6cf39d3287fc
memoria_task_id: 534
actio_task_id: null
memory_links:
  - E:/Document/Ars/Calliope/docs/design/glab-pm.md
  - E:/Document/Ars/GLAB/DESIGN.md
---
# 設計相談: GLAB 学生 PJ のタスク正本・velocity ソース・自律性境界

## 目的

Calliope×GLAB PM 連携 (Calliope docs/design/glab-pm.md §H1) の前提裁定。
実装 (GLAB projects プラグイン以降) の仕様を確定させる。**裁定者は neco。**

## 検討事項 (glab-pm.md §H1 の 3 点)

1. **学生 PJ のタスク正本の置き場** — (a) Actio 本体 project scope / (b) Actio-SchoolModules /
   (c) GLAB 自前 SQLite。MUSA 原則 (タスクエンジンを二重実装しない) からは (a)/(b) が本線。
   学生認証は Cernere 前提 (GLAB は Cernere user_id 参照のみ保持)。
2. **velocity ソース** — 学生 PJ は人間作業で Memoria agent_runs (AI 実績) が使えない。
   タスク完了実績ベース / 見積り申告ベースのどちらを sprint エンジンに注入するか。
3. **自律性境界** — 学生 PJ への Calliope 書込 (タスク生成・リスケ) の承認者を
   運営者のみとするか、PJ リーダー承認を挟むか。

## 完了条件

- 3 点の比較 (decision-metrics 4 軸: AI 学習量 / 作業コスト / 目的達成度 / 主目的一致度) を
  まとめた提案を本 md に追記し、ユーザ (neco) へメンションで裁定を仰ぐ。
- 裁定結果を本 md とCalliope docs/design/glab-pm.md §H1 に追記して確定させる。
- コードは書かない (設計相談)。

## スコープ (編集可ディレクトリ)

- spec/tasks/ (本ファイルへの追記)
- (参照のみ: E:/Document/Ars/Actio, E:/Document/Ars/Actio-SchoolModules, E:/Document/Ars/Calliope)
