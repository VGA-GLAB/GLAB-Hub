---
task: cleanup-b1-code
project: GLAB
kind: 実装
created: 2026-08-18T00:00:00.000Z
memory_links:
  - ../plan/2026-08-18-cleanup-backlog.md
  - ../../CLAUDE.md
---
# cleanup backlog 束 B1 — code cleanup

## 目的

`spec/plan/2026-08-18-cleanup-backlog.md` を正本として、束 B1 (`plugins/` /
`bot/` / `tests/` のコード変更) に割り当てられた 15 項目 — 種別 A (A1〜A5)、
種別 C (C1〜C4)、種別 D (D1〜D6) — を消化する。

狙いは 3 つ。

1. **デッドコードを残さない** — 参照の無い関数と、定義ファイル内でしか使わない
   export が積み上がると、読む側が「どこかから使われているはず」と誤読して
   消せなくなる。A1〜A5 でその層を落とす。
2. **同じ設定を 2 箇所に置かない** — Aedilis コネクタ設定・
   `GLAB_PROJECTS_SERVICE_TOKEN` の読み取り・URL 正規化ヘルパが複数箇所に
   重複しており、片方だけ直す事故が起きうる。C1〜C4 で 1 箇所に寄せる。
3. **データ層をテストできる形にする** — consult / forum / roles / tech-links は
   SQL が route ハンドラに直書きで、`SqlDb` 単位のテストが書けなかった。D6 で
   store 層へ出し、D1〜D5 で実 SQLite の CRUD テストを足す。

束 B2 (spec / README / DESIGN / CLAUDE / .anatomia の文書修正) は別セッションが
並行で進めているため、本タスクは文書に触れない。

## 完了条件

- **A1〜A4**: `deleteBotConfig` / `parseGameDetail` / `setAttendanceStatus` を
  関数ごと削除し、`setAttendanceStatus` に依存していた
  `tests/glab-user-data.test.ts` のケースを差し替える。`ATTENDANCE_STATUSES` /
  `DEFAULT_ROLE_DEFS` / `EventStore` / `FacilityStore` / `renderProject` の
  `export` を外す。`glab_user` の deprecated 列 (`attendance_status` /
  `attendance_event_id` / `attendance_checked_in_at`) と索引は温存する
  (backlog §4)。
- **A5**: 定義ファイル外から参照されない型 export を外す。公開契約を表す型は
  残してよく、残す場合は理由を PR 本文に書く。A1〜A4 とは別コミットにする。
- **C1〜C4**: Aedilis コネクタの生成を `plugins/shared.ts` のファクトリへ寄せる
  (`id` / `title` / `scope` / `healthPath` を変えない、`registerConnector` は
  facility の 1 箇所のまま)。`AEDILIS_BASE_URL` と
  `GLAB_PROJECTS_SERVICE_TOKEN` の読み取り、および 3 つの URL 正規化ヘルパを
  それぞれ 1 箇所にする。挙動は変えない。
- **D1〜D6**: consult / forum / roles / tech-links の route 内インライン SQL を
  各モジュールの `store.ts` へ移す。route ハンドラの入出力と権限判定
  (`canSee` / `requireAdmin` / `canEdit`) は変えない。`glab_gateway` を含む各
  テーブルの CRUD テストを `tests/` に足す。テストは
  `tests/schema-wal-idempotence.test.ts` と同じく `node:sqlite`
  (`DatabaseSync`) の実 SQLite で書き、新しい依存を足さない。
- `plugins/data.ts` のテーブル定義 (DDL) と `corpus/` submodule は変更しない。
- `npm run typecheck` (hub + frontend の 2 tsconfig) と
  `npm --prefix bot run typecheck` が通る。`npm test` / `npm run build` は
  Revisor ゲートに委ねる。
- 変更は 1 つの Revisor local PR に集約し、コミットは種別ごと (A / C / D / A5)
  に分ける。
