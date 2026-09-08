---
task: define-corpus-token-cache-contract
project: GLAB
kind: 設計相談
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - plugins/shared.ts
  - E:/Document/Ars/Corpus/server/hub/tokens.ts
---
# Corpus token cache の並行発行と掃除契約を定義する

## 目的

Corpus の token provider が同じ key の token を並行発行する問題と、期限切れ cache entry を保持し続ける問題について、
GLAB が必要とする契約と Corpus 側へ渡す変更範囲を確定する。

## 完了条件

- WebSocket client の重複と下流 user token の重複発行を別の問題として記述する。
- token cache key の構成、同一 key の in-flight Promise 共有、成功・失敗時の cache 更新を定義する。
- 有効期限判定、期限切れ entry の削除契機、上限または掃除方法を定義する。
- 発行失敗時の GLAB 側 fail-closed 契約と、再試行時に失敗 Promise を残さない契約を定義する。
- Corpus へ渡す変更要求と受け入れ条件を文書化する。GLAB の `corpus/` submodule 内部は直接編集しない。

## スコープ (編集可ディレクトリ)

- `spec/`
