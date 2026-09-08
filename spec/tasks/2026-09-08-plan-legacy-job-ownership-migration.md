---
task: plan-legacy-job-ownership-migration
project: GLAB
kind: 設計相談
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - spec/data/glab-job.md
  - spec/feature/discord-job.md
  - bot/commands/job.ts
  - plugins/jobs/index.ts
---
# 旧 Discord 求人の所有者移行を設計する

## 目的

旧 Discord 投稿の `posted_by = "<username> (discord)"` と Web の Cernere user ID が一致せず、
投稿者本人が募集終了できない移行問題を解決する。アカウント名だけの自動推定や現データの即時書換えは行わない。

## 完了条件

- 影響対象を抽出する read-only query と、件数・値を秘密情報なしで確認する手順を定義する。
- Cernere で認証された本人と旧投稿を結ぶために必要な証跡を定義し、username 一致だけでは移行しない。
- 対応関係が一意、曖昧、確認不能な場合を分け、曖昧・確認不能は管理者対応へ送る。
- 所有者変更の管理者 UI または移行手順、監査記録、dry-run、rollback 要件を定義する。
- 既存データを書き換えずに設計判断を確定し、実装とデータ移行を別作業として切り出せる状態にする。

## スコープ (編集可ディレクトリ)

- `spec/data/`
- `spec/feature/`
- `spec/plan/`
