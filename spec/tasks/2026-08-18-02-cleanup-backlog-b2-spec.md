---
task: cleanup-backlog-b2-spec
project: GLAB
kind: 実装
created: 2026-08-18
memory_links:
  - spec/plan/2026-08-18-cleanup-backlog.md
  - spec/data/glab-user.md
  - spec/data/glab-attendance.md
  - spec/interface/aedilis-connector.md
  - spec/test/strategy.md
  - spec/anatomia-domains.md
  - DESIGN.md
  - README.md
  - CLAUDE.md
---
# cleanup backlog 束 B2 (spec cleanup PR) の消化

## 目的

`spec/plan/2026-08-18-cleanup-backlog.md` を正本とする実装 cleanup backlog のうち、
束 B2 (spec cleanup PR) — 種別 B (B1〜B8) / 種別 F (F1) / 種別 G (G1〜G2) — を
docs-only で消化し、spec ↔ 実装の乖離 (出席正本の記述不一致、モジュール一覧の
網羅漏れ、退役した survey 語彙の残存) と Anatomia ドメイン宣言の不足を解消する。

## 完了条件

- `spec/data/glab-user.md` の `attendance_status` / `attendance_event_id` /
  `attendance_checked_in_at` に deprecated (v2P1) 注記と `glab_attendance` への
  リンクがあり、列を温存する旨が明記されている (B1)。
- `DESIGN.md` の出席検証経路の記述が自前 Ed25519 検証 (`glab_gateway` キャッシュ) に
  一致し、`DESIGN.md` / `CLAUDE.md` / `spec/interface/aedilis-connector.md` の出席
  保存先の記述が `glab_attendance` 正本で揃っている (B2〜B4)。
- `DESIGN.md` のモジュール表と `README.md` の機能表・構成ツリーが
  `plugins/pack.json` の `modules` 15 件と整合している (B5〜B7)。
- `spec/test/strategy.md` の自動テスト記述が退役 survey 語彙を含まず、
  `tests/schema-wal-idempotence.test.ts` の現行内容 (ensureSchema の冪等 +
  `glab_job`/`glab_project`/`glab_project_member` CRUD) を反映している (B8)。
- `spec/tasks/` の archive 規約が無いことの運用注記が存在する (F1)。
- `spec/domains/platform-shell.domain.json` に `scripts/` の所属宣言があり、
  JSON として構文が妥当である (G1)。
- `.anatomia/link-stability.json` が `.gitignore` に登録されている (G2)。
- 変更が `plugins/` / `bot/` / `tests/` / `server.ts` / `corpus/` /
  `spec/plan/2026-08-18-cleanup-backlog.md` 本文に及んでいない。

## スコープ (編集可ディレクトリ)

`spec/`, `README.md`, `DESIGN.md`, `CLAUDE.md`, `.anatomia/`, `.gitignore`
