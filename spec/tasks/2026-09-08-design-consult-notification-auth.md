---
task: design-consult-notification-auth
project: GLAB
kind: 設計相談
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - spec/feature/consult.md
  - spec/interface/discord-commands.md
  - bot/glab-api.ts
  - bot/notify/scheduler.ts
---
# 相談通知の機械認証と ACK 契約を設計する

## 目的

相談通知 Bot の service token が Corpus の user authentication gate で 401 になる問題を、
利用者認証の単純な迂回を作らずに解決する。通知専用の機械主体、権限、配送 ACK の契約を決める。

## 完了条件

- 通知 Bot の機械 identity の発行者、audience、期限、rotation、失効方法を定義する。
- pending 取得、posted ACK、resolved 取得、resolved-posted ACK に必要な最小権限を endpoint ごとに定義する。
- user route と machine route の認証順序と mount 境界を定義し、一般の `/api/*` を匿名開放しない。
- ACK の認可対象、idempotency、再送、Discord 投稿成功前後の障害時挙動を定義する。
- credential 不在・不正・期限切れを区別した応答と監査要件を定義し、GLAB / Corpus の実装分担を確定する。

## スコープ (編集可ディレクトリ)

- `spec/feature/`
- `spec/interface/`
- `spec/plan/`
