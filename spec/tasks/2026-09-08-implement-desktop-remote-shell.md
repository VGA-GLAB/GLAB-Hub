---
task: implement-desktop-remote-shell
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-desktop-primary-path-design.md
  - spec/tasks/2026-09-08-design-desktop-primary-path.md
  - spec/plan/glab-hub-v0.2.md
  - spec/feature/attendance.md
---
# GLAB desktop remote shell を実装する

## 目的

共有 GLAB Hub を表示する専用 Electron shell を `desktop/` に実装し、既存 Web 機能を安全な desktop 経路から使える
ようにする。内蔵 server と background agent、配布運用は含めない。

## 完了条件

- remote Hub だけを読み、内蔵 server を起動しない最小 package と window lifecycle を実装する。
- context isolation、sandbox、node integration 無効、最小 preload、HTTPS navigation allowlist を適用する。
- same-origin HttpOnly cookie を用い、renderer storage や background process に token を複製しない。
- single-instance、外部 link、login、dashboard、求人・予定・相談、browser fallback を実装する。
- Ostiarius/passkey の既存出席契約を通し、旧 auto-attendance を復活させないテストを用意する。

## スコープ (編集可ディレクトリ)

- `desktop/`
- `tests/`
- `spec/feature/`
- `spec/interface/`
