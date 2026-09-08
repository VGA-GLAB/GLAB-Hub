---
task: implement-job-owner-migration
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-legacy-job-owner-migration-design.md
  - spec/tasks/2026-09-08-plan-legacy-job-ownership-migration.md
  - plugins/data.ts
  - plugins/jobs/index.ts
  - bot/commands/job.ts
---
# 旧求人 owner 移行機構を実装する

## 目的

求人の認可主体を Cernere user ID に統一するため、canonical owner、世代、監査、新規 write、管理 UI、
read-only 分類と CAS migration tool を実装する。既存データの実更新は含めない。

## 完了条件

- `owner_user_id`、`owner_revision`、追記型 owner migration 監査を後方互換 migration で追加する。
- 新規求人と close 認可を canonical owner へ切り替え、未解決旧求人は管理者対応へ案内する。
- Discord suffix を先に除外する read-only 分類と、証跡を要求する dry-run 出力を実装する。
- owner と revision を条件に更新・rollback する CAS tool を実装し、ABA と後続変更の上書きを防ぐ。
- schema、API、UI、分類、監査、CAS の契約テストを用意する。

## スコープ (編集可ディレクトリ)

- `plugins/data.ts`
- `plugins/jobs/`
- `scripts/`
- `tests/`
- `spec/data/`
- `spec/interface/`
