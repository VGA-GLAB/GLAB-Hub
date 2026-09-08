---
task: release-desktop-primary-path
project: GLAB
kind: 雑用
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-desktop-primary-path-design.md
  - spec/tasks/2026-09-08-implement-desktop-remote-shell.md
  - spec/plan/2026-09-08-member-authorization-design.md
  - docs/manual/overview.md
---
# Desktop を GLAB 主経路として段階展開する

## 目的

desktop shell と部員認可が受入済みになった後、署名済み installer を pilot から段階展開し、rollback と Web fallback を
保ったまま desktop を主経路として案内する。

## 完了条件

- 実施操作がユーザーの明示承認範囲にあることを確認し、未承認分だけ承認を得る。
- 署名鍵の所有・保管、正規配布 URL、checksum、最低対応 OS、前版 installer を release gate で確認する。
- internal pilot で認証、部員 gate、主要 Web 機能、単一起動、障害時 fallback を確認する。
- 段階 rollout の停止条件と前版 rollback を実施可能にし、利用者案内を各段階に合わせる。
- desktop の受入条件を満たすまで Web を現行操作先として維持する。

## スコープ (編集可ディレクトリ)

- `desktop/`
- `docs/manual/`
- `spec/plan/`
