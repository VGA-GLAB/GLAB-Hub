---
task: 02-projects-plugin
project: GLAB
kind: 実装
status: delegated
delegation_run_id: 7bcd4fac-1382-4697-b76e-d0cdfaa856b1
created: 2026-07-16T00:00:00.000Z
source_session: lictor-9747bcfe-3969-4e12-959d-6cf39d3287fc
memoria_task_id: 535
actio_task_id: null
memory_links:
  - E:/Document/Ars/Calliope/docs/design/glab-pm.md
  - E:/Document/Ars/GLAB/CLAUDE.md
---
# projects プラグイン — 学生ゲーム制作 PJ レジストリ (正本)

## 目的

Calliope docs/design/glab-pm.md §H2 の実装。GLAB Hub に学生ゲーム制作プロジェクトの
レジストリ (正本) を新設し、Calliope が read できる API を公開する。

前提: 設計相談 (2026-07-16-01-pm-task-source.md) は **2026-07-17 最終裁定済み (done)**。
同 md の「**最終裁定**」節が本タスクの仕様前提 (途中の裁定節と食い違う部分は最終裁定が正):
タスク正本 = Actio コア tasks の **project_id 新設** (値 = GLAB `glab_project.id` の不透明参照、
Actio 側に project マスタなし)、承認ロールは プロデューサー (PJ 単位) + 総合ディレクター
(hub 全体)、学生の裁量あり (自 PJ タスク操作は GLAB 簡易 UI で自由)。

## 完了条件

- `plugins/projects/index.ts` + `panel.ts` を CorpusModule 規約で新設
  (sdk.ts 経由 import、hono 直 import 禁止)。`plugins/pack.json` と
  `package.json` build:panels に登録。
- スキーマは `plugins/data.ts` に集約: `glab_project` (id, name, description,
  status[active/paused/closed], repo_url?, created_at) +
  `glab_project_member` (project_id, user_id=Cernere 参照, role[**producer**/member])。
  Actio へのリンク列は**不要** (最終裁定: Actio `tasks.project_id` が `glab_project.id` を
  参照する逆方向リンクのため)。総合ディレクター (hub 全体ロール) は PJ 単位ではなく
  hub 側の管理ロールとして扱う (既存の admin 判定機構があればそれを流用し、
  新設なら glab_user 側に持たせる)。
  名前・学科等の個人属性は保持しない (Cernere vantan_user が単一情報源)。
  migration は冪等、INDEX は ALTER の後。
- Actio との配線 (タスク簡易 UI・project_id 連携) は本タスクでは**行わない**
  (Actio 側タスク `Actio/spec/tasks/2026-07-17-01-glab-project-tasks.md` と後続の別タスク)。
  本タスクはレジストリ + パネル + read API まで。
- パネル: PJ 一覧 / 登録・編集 / メンバー割当 (Cernere user_id の選択は既存
  vantan-user の参照経路を流用)。
- 外部サービス向け read API (`/api/glab/projects`、service token 認可) を公開し、
  レスポンス契約を spec/interface/ に md で記録する。
- `plugins/data.ts` クエリの vitest 最小ケースを追加。
  `npm run typecheck` / `npm run build` / bot typecheck green。

## スコープ (編集可ディレクトリ)

- plugins/projects/ (新設)
- plugins/data.ts
- plugins/pack.json
- package.json (build:panels)
- spec/interface/
- tests/
- (corpus/ submodule は変更禁止)
