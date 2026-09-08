---
task: fail-closed-downstream-token
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - plugins/shared.ts
  - spec/interface/aedilis-connector.md
  - spec/interface/volputas-connector.md
---
# 下流 token 発行失敗時の匿名中継を止める

## 目的

`plugins/shared.ts` の下流サービス中継で token を取得できない場合に、認証情報なしの request を送らず
fail closed にする。下流の公開応答へ偶然到達する挙動を認可として扱わない。

## 完了条件

- token provider が失敗、`null`、空文字を返す各経路で下流 fetch を実行しない。
- 呼出元へ一貫した認証エラーまたは明示的な degraded 応答を返し、匿名 fallback を行わない。
- token 取得成功時だけ `Authorization` header を構築し、空 bearer を送らない。
- `plugins/shared.ts` を利用する全コネクタへの影響を列挙し、既存の公開 health endpoint と認証必須 API を混同しない。
- token 不在時に下流 request が発生しないことと、成功時の中継契約を検証する回帰テストを用意する。

## スコープ (編集可ディレクトリ)

- `plugins/`
- `tests/`
- `spec/interface/`
