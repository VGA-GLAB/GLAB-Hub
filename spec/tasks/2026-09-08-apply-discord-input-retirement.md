---
task: apply-discord-input-retirement
project: GLAB
kind: 雑用
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - spec/interface/discord-commands.md
  - bot/commands/registry.ts
  - bot/index.ts
---
# Discord 入力廃止を運用環境へ反映する

## 目的

Discord 側に残る global / guild Slash command と稼働中の旧 Bot を、承認された運用手順で通知専用版へ切り替える。
Bot 個別の Excubitor catalog 定義を推測せず、正本を確定してから操作する。

## 完了条件

- 過去に command を登録した application、global scope、全 guild ID を根拠付きで列挙する。
- Discord REST 登録変更とサービス切替がユーザーの明示承認範囲にあることを確認し、未承認分だけ承認を得る。
- サービス操作前に対象 project / testing claim を登録し、プロジェクト本体から Excubitor 経由で実施する。
- 空 command 一覧を global と過去に使った全 guild へ同期し、各 scope が 0 件であることを取得結果で確認する。
- 正式な管理対象を確定して通知専用 Bot を反映し、残存 command が停止案内だけを返すことと、対象通知が配送されることを確認する。
- 作業終了時に claim を release し、実施結果と失敗した通知経路を報告する。

## スコープ (編集可ディレクトリ)

- リポジトリ編集なし（Discord 登録と正規のサービス管理操作のみ）
