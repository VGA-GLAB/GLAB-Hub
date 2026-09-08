---
task: review-anatomia-1510-anchors
project: GLAB
kind: レビュー
created: 2026-09-08
memory_links:
  - spec/anatomia-domains.md
  - spec/domains/
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - bot/index.ts
  - bot/commands/registry.ts
---
# GLAB Revisor PR #1510 の Anatomia programレビュー所見を解消する

## 目的

GLAB Revisor PR #1510 の Anatomia programレビュー所見にある未分類 changed anchors 9 件を、実際のレビュー成果物から特定し、
適切な domain への分類または除外理由を確定する。名称や想像だけで対象 anchor を作らない。

## 完了条件

- #1510 が参照するレビュー成果物を取得し、そこに記録された 9 件の anchor を識別子と source path 付きで列挙する。
- 各 anchor について既存 domain の分類先、新規 domain が必要な理由、または除外理由のいずれかを根拠付きで決める。
- 生成物、vendor、submodule、テスト fixture などの除外は、適用した規則と対象 path を記録する。
- 9 件すべてを過不足なく照合し、名称推測で追加した項目がないことをレビュー成果物と突合する。
- 必要な domain 宣言修正とレビュー記録だけを残し、機能コードは変更しない。

## スコープ (編集可ディレクトリ)

- `spec/`
- `.anatomia/`
