---
task: external-auth-contract-handoff
project: GLAB
kind: 雑用
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-residual-design-index.md
  - spec/plan/2026-09-08-member-authorization-design.md
  - spec/plan/2026-09-08-corpus-token-cache-contract.md
  - spec/plan/2026-09-08-consult-notification-machine-auth-design.md
  - spec/plan/2026-09-08-cernere-ws-client-lifecycle-design.md
---
# 外部認証契約を正本リポジトリへ引き渡す

## 目的

GLAB で採択した host policy hook、token cache、machine token / service route、hard-exit cleanup の契約を、
Corpus と Cernere の正本リポジトリで実装可能な task に分解して引き渡す。GLAB 側には契約参照だけを残す。

## 完了条件

- 各契約の所有リポジトリ、提供 API、GLAB 側依存、受入条件を対応表にする。
- Corpus と Cernere の各専用 worktree で、重複しない task md を task-workflow 形式で登録する。
- GLAB の設計文書から各所有リポジトリの task 参照へ辿れるようにする。
- 外部契約の提供前に GLAB 側だけを部分導入して完了扱いにしない依存順を残す。

## スコープ (編集可ディレクトリ)

- GLAB: `spec/plan/`
- Corpus: `spec/tasks/`
- Cernere: `spec/tasks/`
