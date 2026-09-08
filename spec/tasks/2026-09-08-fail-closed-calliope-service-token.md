---
task: fail-closed-calliope-service-token
project: GLAB
kind: 実装
created: 2026-09-08
memory_links:
  - spec/plan/2026-09-08-downstream-token-fail-closed-design.md
  - spec/tasks/2026-09-08-fail-closed-downstream-token.md
  - spec/plan/problem_logs/2026-09-08-discord-input-retirement.md
  - plugins/progress/connector.ts
  - plugins/progress/relay.ts
---
# Calliope service token 不在時の匿名中継を止める

## 目的

progress の固定 machine-token 経路で `CALLIOPE_SERVICE_TOKEN` が未設定、空文字、空白の場合に下流 fetch を行わず、
明示的な503へ fail closed にする。user-token helper の既存 task とは別経路として扱う。

## 完了条件

- connector が固定 token の未設定、空文字、空白を request 構築前に拒否する。
- relay が 503 `service_token_unavailable` と `Cache-Control: no-store` を返し、token 値をログへ出さない。
- token 不在時の下流 fetch が0回、成功時は正しい Authorization header が一つであることを検証する。
- 公開 `/health` は token 不要のまま維持し、認証必須 relay と混同しない。

## スコープ (編集可ディレクトリ)

- `plugins/progress/`
- `tests/`
- `spec/interface/`
- `spec/plan/`
