---
task: integrate-cernere-client-shutdown
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-cernere-ws-client-lifecycle-design.md
  - spec/tasks/2026-09-08-share-cernere-ws-client.md
  - server.ts
  - plugins/cernere/create-client.ts
---
# 共有 Cernere client を server lifecycle に統合する

## 目的

既存の client 共有 task が実装する owner を `server.ts` の shutdown と初期化失敗 cleanup へ接続する。
plugin 側の共有 owner 自体は重複実装しない。

## 完了条件

- SIGINT / SIGTERM と bootstrap 全体失敗で共有 owner の `closeAll()` を一度だけ呼ぶ。
- 単一 plugin 失敗を隔離する場合は他 plugin の共有接続を維持し、process 終了時に閉じる。
- credential rotation の切替、失敗時旧接続維持、漏洩失効時即時 close を server lifecycle と整合させる。
- Corpus の直接 `process.exit(1)` では cleanup を保証できない制約を保持し、保証外経路をテストで区別する。
- store cleanup と client cleanup の順序、冪等性、pending request の reject を検証する。

## スコープ (編集可ディレクトリ)

- `server.ts`
- `plugins/cernere/`
- `tests/`
- `spec/plan/`
