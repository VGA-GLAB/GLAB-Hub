# GLAB Anatomia ドメイン定義

GLAB の責務境界を Anatomia のドメインとして明文化したもの。正本は
`spec/domains/*.domain.json` (Anatomia の EditableDomainDef 形式) で、本書はその
設計意図と境界条件を人間向けに記述する。

## なぜ必要か

Revisor のローカル PR 審査は、変更されたアンカー (関数) が 1 つもドメインに
所属しない場合「対象ドメインが未定義」としてマージをブロックする。GLAB には
ドメイン定義が 1 つも無く、どのプラグインへの変更もこのゲートで止まっていた。
ドメインは PR ごとに後付けするものではなくリポジトリの責務地図なので、
plugins/pack.json のモジュール構成と DESIGN.md 2〜7 章から一括で定義する。

## 形式

各ドメインは `spec/domains/<slug>.domain.json` に 1 ファイル。所属は
`membership` の `pathPattern` で表現する。パス正規表現はコードと対応するテストを
ともに含め、ドメインを変更するときはこの JSON を直接編集する。

## ドメイン一覧

| ドメイン | 範囲 | 責務と境界 |
|---|---|---|
| `platform-shell` | `server.ts`, `public/src/`, `plugins/shared.ts`, `panel-kit.ts`, `data.ts`, `service-health-connector.ts`, `scripts/` | プラグインが載る土台。Corpus 起動、GLAB frontend shell、共通パネル骨格、SQLite スキーマ正本、接続先 health 集約、ビルド補助スクリプト。業務ロジックは持たない |
| `identity-access` | `plugins/cernere/`, `cernere-admin/`, `vantan-user/`, `roles/` | Cernere を単一情報源とする本人性・所属・権限。プロフィール値を GLAB SQLite へ複製しない |
| `attendance` | `plugins/attendance/` | 集会出席。attestation の自前検証と出席台帳。GLAB が正本を持つ |
| `events-scheduling` | `plugins/events/` | イベント登録/削除/週間ビュー/繰り返し。GLAB PostgreSQL が正本。予約失敗時の compensation を含む |
| `facility-reservation` | `plugins/facility/` | Aedilis 施設・予約 API の中継のみ。施設データを複製しない。未設定時は degraded |
| `careers` | `plugins/jobs/`, `plugins/tirocinium/` | 求人板と就活データ中継、企業マスタ検索。企業の公開情報は Tirocinium が正本 |
| `game-feedback` | `plugins/volputas/` | 設問 = Volputas、回答 = Cernere が正本。GLAB は表示と投稿の面だけ |
| `discussion` | `plugins/di/` | Discutere 連携の議論・学習ビュー |
| `project-showcase` | `plugins/projects/` | GitHub Release 表示/DL/更新通知、Omnipotens 解析レポートの保存と要約 |
| `progress-tracking` | `plugins/progress/` | Calliope 進捗の表示面。エンジンは Calliope、自前 DB へキャッシュしない |
| `community-space` | `plugins/forum/`, `consult/`, `tech-links/` | フォーラム・在席 (おれひま)・技術リンク共有 |
| `discord-bot` | `bot/` | discord.js Gateway 常時接続の運用ランタイム。hub とは DB 経由でだけ結合 |

`progress-tracking` は先行宣言だったが `plugins/progress/` として実装済み
(`spec/tasks/2026-07-16-03-progress-panel.md` / 接続契約は
[`interface/calliope-connector.md`](./interface/calliope-connector.md))。
`plugins/progress/` を移動・改名するときは、この行と
`spec/domains/progress-tracking.domain.json` の `membership.pathPattern` を
`project-showcase` との境界ごと引き直す。

## 意図的に含めないもの

- `tests/` — テストコードは production の実装体ではないが、変更を正しい責務へ
  分類できるよう、各ドメインの `membership.pathPattern` に対応するテスト名を含める。
- `corpus/` — submodule であり GLAB の責務ではない。変更禁止。
- 「その他」に相当する受け皿ドメイン — Anatomia の `unassigned` は所属関係の
  状態であってドメインではない。受け皿を作ると境界の議論が起きなくなる。

## 分割の考え方

プラグイン 1 つ = 1 ドメインにはしていない。データの正本が誰かで切っている。

- `facility-reservation` と `events-scheduling` は UI が隣接するが正本が違う
  (Aedilis / GLAB PostgreSQL) ので分ける。
- `jobs` と `tirocinium` はどちらも就活データを Cernere/Tirocinium へ中継する
  同じ責務なので `careers` に束ねる。
- `forum` / `consult` / `tech-links` は GLAB 内で完結する交流面なので
  `community-space` に束ねる。
