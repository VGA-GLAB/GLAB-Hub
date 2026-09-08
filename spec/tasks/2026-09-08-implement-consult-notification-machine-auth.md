---
task: implement-consult-notification-machine-auth
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-consult-notification-machine-auth-design.md
  - spec/tasks/2026-09-08-design-consult-notification-auth.md
  - plugins/consult/index.ts
  - bot/glab-api.ts
  - bot/notify/scheduler.ts
---
# 相談通知の機械認証を実装する

## 目的

Cernere の専用 principal と Corpus の service route 契約が提供された後、相談通知の read / ACK を最小 scope の
機械認証へ移し、利用者認証の迂回や presence 操作の混入を防ぐ。

## 完了条件

- 指定 audience、短命 token、credential generation、失効照会を service route で fail closed に検証する。
- pending / resolved の GET と posted / resolved-posted の POST だけを read / ack scope へ割り当てる。
- presence resolve/write と一般 user API が notifier principal から到達不能であることを検証する。
- 送信 intent、Discord message ID、confirmed、delivery ID を用いる journal と冪等 ACK を実装する。
- 発行・検証・配送・ACK の各障害と crash window をテストし、degraded 通知を観測可能にする。

## スコープ (編集可ディレクトリ)

- `plugins/data.ts`
- `plugins/consult/`
- `bot/`
- `tests/`
- `spec/interface/`
