---
task: implement-member-authorization
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-member-authorization-design.md
  - spec/tasks/2026-09-08-separate-member-authorization.md
  - plugins/data.ts
  - plugins/members/index.ts
  - plugins/vantan-user/index.ts
---
# GLAB 部員認可を実装する

## 目的

Cernere 本人認証と `glab_member` 部員資格を分離し、期限、状態、監査、操作別 policy を plugin API と
hub aggregation の両入口へ同じ基準で適用する。

## 完了条件

- 既存行を無期限として維持する期限 migration と、検証・追記型監査を実装する。
- active / invited / suspended / alumni / 未登録 / 期限切れを設計どおり method・path 単位で判定する。
- plugin API と `/api/hub/data` の両方へ Corpus host policy hook を適用し、DB 障害も fail closed にする。
- 初回 profile と管理者 bootstrap の限定例外、403/503 no-store、利用者案内を実装する。
- Corpus hook を含む契約テストが通るまで部分導入を完了扱いにしない。

## スコープ (編集可ディレクトリ)

- `plugins/`
- `tests/`
- `spec/data/`
- `spec/feature/`
- `spec/interface/`
