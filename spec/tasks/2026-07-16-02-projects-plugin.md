---
task: 02-projects-plugin
project: GLAB
kind: 実装
status: done
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
同 md の「最終裁定」節が本タスクの仕様前提: タスク正本 = Actio コア tasks の
**project_id 新設** (値 = GLAB `glab_project.id` の不透明参照、Actio 側に project マスタなし)、
承認ロールは プロデューサー (PJ 単位) + 総合ディレクター (hub 全体)、学生の裁量あり
(自 PJ タスク操作は GLAB 簡易 UI で自由。タスク自体の実装は別タスク、本タスクの対象外)。

## 完了条件

- `plugins/projects/index.ts` + `panel.ts` を CorpusModule 規約で新設
  (sdk.ts 経由 import、hono 直 import 禁止)。`plugins/pack.json` と
  `package.json` build:panels に登録。
- スキーマは `plugins/data.ts` に集約: `glab_project` (id, name, description,
  status[active/paused/closed], repo_url?, created_at) +
  `glab_project_member` (project_id, user_id=Cernere 参照, role[**producer**/member])。
  Actio へのリンク列は不要 (最終裁定: Actio `tasks.project_id` が `glab_project.id` を
  参照する逆方向リンクのため)。名前・学科等の個人属性は保持しない
  (Cernere vantan_user が単一情報源)。migration は冪等、INDEX は ALTER の後。
- パネル: PJ 一覧 / 登録・編集 / メンバー割当 (Cernere user_id の選択は既存
  vantan-user / attendance と同じ glab_user + 表示名キャッシュの参照経路を流用)。
- 外部サービス向け read API (`/api/glab/projects`、service token 認可) を公開し、
  レスポンス契約を spec/interface/ に md で記録する。
- `plugins/data.ts` クエリのテスト最小ケースを追加 (本リポの既存規約に倣い
  `node --test`。 `npm run typecheck` / `npm run build` green)。

## スコープ (編集可ディレクトリ)

- plugins/projects/ (新設)
- plugins/data.ts
- plugins/pack.json
- package.json (build:panels)
- spec/interface/
- tests/
- (corpus/ submodule は変更禁止)

## 実装 (2026-07-19)

- `plugins/projects/index.ts` + `panel.ts` + `service-auth.ts` を新設。
  `plugins/data.ts` に `glab_project` / `glab_project_member` (role: producer/member) +
  CRUD 関数を追加。`pack.json` の modules と `package.json` build:panels に登録。
- 総合ディレクター判定は Corpus 既存の `requireAdmin` を流用 (新規ロール機構なし)。
  プロデューサーは `glab_project_member.role` に PJ 単位で保持。
- 外部 read API は `service-auth.ts` の `requireServiceToken` (env
  `GLAB_PROJECTS_SERVICE_TOKEN`、timing-safe 比較、未設定時 503) で認可。
  Corpus `requireAuth` が `/api/*` 全体に既に掛かっており (corpus/ 変更禁止のため
  回避不可)、実際の到達パスは `/api/x/projects/external/projects` になる
  (設計文書の `/api/glab/projects` 表記との差異と理由は
  `spec/interface/projects-registry.md` に明記)。
- `npm run typecheck` / `npm test` (37 tests, `tests/projects-data.test.ts` +
  `tests/service-auth.test.ts` 追加分含む) / `npm run build` すべて green。
- Omnipotensレビューはプロジェクト管理画面からGLabの既存「レビュー」画面へ移す。
  `GLAB_OMNIPOTENS_REVIEW_ROOT`の値そのものを`Review`ルートとして
  `<project>/report`を参照し、サマリ契約は第3版とする。
