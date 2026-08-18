---
task: 01-cleanup-backlog
project: GLAB
kind: 調査
status: in_review
delegation_run_id: f8582e6c-28a8-4ca8-8cbc-d606128fc34e
created: 2026-08-18T00:00:00.000Z
source_session: lictor-09a66da5-a047-4223-8abf-b72c52c3bcf9
memoria_task_id: 1087
actio_task_id: null
memory_links:
  - ../plan/2026-07-16-review-fix-tasks.md
  - ../../CLAUDE.md
---
# 実装 cleanup backlog の再生成 (docs-only)

## 目的

2026-07-16 の実装レビューで「cleanup 系 ~30 件 (surveys 参照残り・重複コネクタ 等) が残る」
と記録されたが、具体リストが失われていた。GLab チーム目標 G4 step2「cleanup 残を消化する」を
着手可能にするため、現行 main (`fb07a92`) を読み直して backlog を起こし直す。

この PR は **docs-only** である。コード・spec 本文の修正、テストの追加、依存の変更は含まない。
実際の cleanup は本 backlog の束 B1 (code cleanup PR) / B2 (spec cleanup PR) として後続で行う。

## 完了条件

- `spec/plan/2026-08-18-cleanup-backlog.md` を日本語で新設し、以下を含める。
  - 目的と対象コミット (main の SHA)
  - 項目表 (番号 / 種別 / `file:line` / 内容 / 対処案 / リスク / 束)。`file:line` は
    対象コミットで実在を確認した行のみを書き、推測を含めない
  - 束ごとの実施順と検証手順 (`npm run typecheck` / `npm test` / `npm run build` の
    どれで担保するか)
  - 「やらないこと」(温存する deprecated 列、DROP しないテーブル 等)
- 観点 (a) 未使用 export / デッドコード、(b) spec ↔ 実装の乖離、(c) 重複定義、
  (d) 新テーブルのテスト未カバー、(e) 旧設計の残骸、(f) `spec/tasks/*.md` の status、
  (g) Anatomia 未宣言ディレクトリ をすべて走査した結果を載せる。
- seed S1 (Aedilis connector 二重定義) / S2 (`attendance_status` の spec 乖離) /
  S3 (Nuntius 前提の記述) / S4 (`spec/tasks` の status: done) をそれぞれ検証し、
  表に含めるか却下理由を明記する。
- `corpus/` submodule を変更しない。コード・既存 spec 本文を変更しない。

## 結果

起票 25 件 / 却下 4 件 / 現状維持 1 件。束の内訳は B1 (code cleanup) 15 件、
B2 (spec cleanup) 10 件。seed は S1 = 起票 (性質を「重複登録」から「生成の重複」へ訂正)、
S2 = 起票、S3 = 却下 (残存 2 箇所はいずれも Nuntius 廃止を記録した最新記述)、
S4 = 現状維持 (archive 規約が無く、他文書からパス参照されている)。詳細は
[`../plan/2026-08-18-cleanup-backlog.md`](../plan/2026-08-18-cleanup-backlog.md)。
