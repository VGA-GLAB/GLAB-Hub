---
task: share-cernere-ws-client
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - plugins/cernere/create-client.ts
  - plugins/cernere/project-client.ts
  - plugins/dashboard/index.ts
  - plugins/consult/index.ts
  - plugins/jobs/index.ts
  - plugins/members/index.ts
  - plugins/tirocinium/index.ts
  - plugins/vantan-user/index.ts
---
# GLAB plugin の Cernere WebSocket client を共有する

## 目的

6 plugin が個別に作る Cernere project WebSocket client を、所有者と終了責務が明確な共有 client に統合する。
再接続や shutdown を含む lifecycle を一箇所で管理し、接続の重複と close 漏れを防ぐ。

## 完了条件

- dashboard、consult、jobs、members、tirocinium、vantan-user が同じ project credential に対して共有 client を使う。
- client の生成、準備完了、再接続、失敗、shutdown の所有者と状態遷移を一つの責務に集約する。
- 正常終了、初期化失敗、途中失敗の全経路で client を一度だけ close する。
- credential 未設定時の既存 degraded / fail-fast 契約を plugin ごとに確認し、黙った代替接続を作らない。
- plugin 初期化順に依存せず単一接続となることと、終了時の close を検証する回帰テストを用意する。

## スコープ (編集可ディレクトリ)

- `plugins/cernere/`
- `plugins/dashboard/`
- `plugins/consult/`
- `plugins/jobs/`
- `plugins/members/`
- `plugins/tirocinium/`
- `plugins/vantan-user/`
- `tests/`
- `spec/`
