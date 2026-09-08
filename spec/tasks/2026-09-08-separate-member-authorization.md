---
task: separate-member-authorization
project: GLAB
kind: 設計相談
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - spec/feature/first-access-registration.md
  - spec/feature/member-roster.md
  - docs/manual/README.md
---
# Cernere 本人認証と GLAB 部員認可を分離する

## 目的

Cernere で本人確認できることと、GLAB の部員として機能を利用できることを別の判定として定義する。
所属情報の正本、未登録者の扱い、退部・期限切れ時の失効契約を決め、各画面と API が同じ認可判断を使えるようにする。

## 完了条件

- Cernere identity と GLAB membership の責務、データ正本、識別子、更新主体を文書で定義する。
- membership の未登録、有効、失効を区別し、各状態で許可する閲覧・操作と HTTP / UI 応答を定義する。
- 初回プロフィール登録を membership 付与として扱わず、認証済み非部員を自動許可しない契約にする。
- 退部、期限切れ、再加入時の反映時点と監査要件を定義する。
- 既存の部員名簿、ロール、プロジェクト membership との関係を整理し、実装タスクへ渡せる判断を残す。

## スコープ (編集可ディレクトリ)

- `spec/feature/`
- `spec/interface/`
- `docs/manual/`
