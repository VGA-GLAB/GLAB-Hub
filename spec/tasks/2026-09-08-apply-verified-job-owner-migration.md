---
task: apply-verified-job-owner-migration
project: GLAB
kind: 雑用
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-legacy-job-owner-migration-design.md
  - spec/tasks/2026-09-08-implement-job-owner-migration.md
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
---
# 確認済み求人 owner migration を適用する

## 目的

owner migration 機構の実装後、read-only 分類と管理者が確認した証跡に基づき既存求人へ owner を適用する。
username や表示名から本人を推測せず、未解決行を安全に残す。

## 完了条件

- 実施操作がユーザーの明示承認範囲にあることを確認し、未承認分だけ承認を得る。
- read-only 分類と dry-run の件数・job ID・CAS revision を保存し、Discord suffix を自動対象から除外する。
- 管理者または認証済み本人連携の証跡がある一意な行だけを適用し、曖昧・未確認行を変更しない。
- 適用結果、競合、未解決、監査 ID を照合し、rollback 入力と手順を保存する。
- rollback が必要な場合も CAS で後続変更を保護し、実施記録を残す。

## スコープ (編集可ディレクトリ)

- `scripts/`
- `spec/plan/`
