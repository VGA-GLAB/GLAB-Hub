# GLAB 利用者向け説明 — 編集者README

このディレクトリは、VANTAN GLab の利用者向け説明原稿の正本です。初期原稿はすべて `draft` で、通常の利用者向け表示への公開は未承認です。

## 目次

| 順番 | 章 | 目的 |
|---:|---|---|
| 10 | [VANTAN GLab を使う](./overview.md) | 製品の用途と主要章への入口 |
| 20 | [初めてログインする](./first-use.md) | ログインと必須プロフィール登録 |
| 30 | [ダッシュボードで今日の活動を始める](./daily-hub.md) | 5分クエストと自分の記録 |
| 40 | [イベントに出席する](./attendance.md) | 会場での出席記録と履歴確認 |
| 50 | [施設を予約する](./facility-reservation.md) | 施設予約の作成・確認・取消 |

画面文脈との対応候補は [contexts.json](./contexts.json) に置く。未知の文脈は `overview` へ案内する契約とする。

## 確認記録

- 共通契約: `AIFormat/FORMAT_HANDBOOK.md`（handbook version 1）
- 静的照合日: 2026-09-08
- `verified_revision`: `34c80b2d9470d8ecb5f6c5331cf82a077cd579c0`
- 照合方法: リポジトリ内の `README.md`、`DESIGN.md`、`public/src/`、`plugins/`、関連する `spec/feature/`・`spec/interface/`・`spec/data/` を目視確認
- UX入力: Praeforma の GLAB experience「部活動を支援する超パワーツール」。UX design / goal は空欄のため、目的や効果を追加で推測していない
- Anatomia project `glab` は解析済み（561 files / 6390 functions）。Praeforma project `01M1ZACJ5YK6G5NEFWX8Z4P6G4` の `anatomiaRepo` も `glab`。今回の `plan --repo <worktree> --task <説明原稿作成> --no-map` は exit 0。`platform-shell`、`identity-access`、`discord-bot` の既存ドメインを検出し、新規ドメインなし。LLM分解が60秒の上限を超えたため、計画は deterministic fallback（hash `d0bb9193b2dddb2d`）で生成された

各章の frontmatter に、その章の操作名と振る舞いを確認した製品内 `source_refs` を記録している。章・アンカー・`contexts.json` の対応は原稿上で静的に照合する。

## 未検証・公開前に必要な確認

- Web UI の「ヘルプ」「使い方」から `contexts.json` を使って章を開く配線は未実装。対応キーは、後続の表示実装で画面側の安定した意味IDとして採用できるか確認する
- ブラウザでのログイン、初回プロフィール登録、日次クエスト、出席、施設予約・取消は実操作していない。表示名、順序、成功表示、空状態、エラー表示を対象 revision の実環境で確認する
- Cernere の本人確認は GLAB の部員資格そのものではない。アクセス対象者と部員判定の運用を公開前に確認する。「部員以外は入れない」などの保証表現は本文に追加しない
- 管理者向け部員名簿は `requireAdmin` の対象。一般利用者向け本文へ管理操作を追加する場合は、権限境界と実画面を別途確認する
- Discord からの GLAB 操作は廃止した。現在の操作先は GLAB の Web 画面で、desktop 版は準備中。Discord は通知先として残るが、相談通知の service token / `requireAuth` 不整合があるため全通知を利用可能とは断定しない
- 出席は進行中イベント、会場 Wi-Fi、Ostiarius、パスキーに依存する。施設予約は Aedilis に依存する。各連携先を含む実環境で確認する
- すべての章は `draft` のまま。公開承認者と公開対象コミットは未定

## 公開記録

- 公開承認者: 未承認
- 公開対象コミット: 未定
- 実操作確認者・確認日: 未実施
