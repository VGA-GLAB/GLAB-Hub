---
task: design-desktop-primary-path
project: GLAB
kind: 設計相談
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - spec/plan/glab-hub-v0.2.md
  - DESIGN.md
  - docs/manual/overview.md
---
# GLAB desktop 主経路の移行設計を確定する

## 目的

「部活動を支援する超パワーツール」という UX を保ちながら、desktop を GLAB の主な利用経路にする設計を決める。
desktop が利用可能になるまでは Web を操作先とし、認証、部員資格、配布、段階移行の条件を明確にする。

## 完了条件

- desktop の実装先と既存 Web / Corpus shell との責務分担を比較し、採用案を決定する。
- Cernere 認証と GLAB 部員認可を desktop でどう受け渡し、token をどこに保持するかを定義する。
- インストール、署名、更新、設定配布、障害時の Web fallback の契約を定義する。
- Web から desktop へ移す機能の順序と、各段階の利用者案内を定義する。
- desktop を主経路と呼べる受け入れ条件、移行中止条件、rollback 条件を具体化する。

## スコープ (編集可ディレクトリ)

- `spec/plan/`
- `spec/feature/`
- `spec/interface/`
- `docs/manual/`
