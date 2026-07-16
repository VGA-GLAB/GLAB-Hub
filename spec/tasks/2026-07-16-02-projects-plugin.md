---
task: 02-projects-plugin
project: GLAB
kind: 実装
status: pending
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

前提: 設計相談 (2026-07-16-01-pm-task-source.md) の裁定が出ていること
(タスク正本の置き場がプラグインのデータ設計に影響するため)。未裁定なら着手せず報告する。

## 完了条件

- `plugins/projects/index.ts` + `panel.ts` を CorpusModule 規約で新設
  (sdk.ts 経由 import、hono 直 import 禁止)。`plugins/pack.json` と
  `package.json` build:panels に登録。
- スキーマは `plugins/data.ts` に集約: `glab_project` (id, name, description,
  status[active/paused/closed], repo_url?, created_at) +
  `glab_project_member` (project_id, user_id=Cernere 参照, role[leader/member])。
  名前・学科等の個人属性は保持しない (Cernere vantan_user が単一情報源)。
  migration は冪等、INDEX は ALTER の後。
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
