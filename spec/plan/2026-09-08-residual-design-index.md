# 2026-09-08 残課題設計 index

## 目的と順序

Discord 入力廃止後に残った境界を、次の依存順で実装・検証する。各文書は設計であり、コード、設定、データ、外部 service
への反映は含まない。

| 順序 | 設計 | 依存・未実装範囲 |
|---:|---|---|
| 1 | [下流 token fail closed](2026-09-08-downstream-token-fail-closed-design.md) | GLAB user-token proxy と Calliope 固定 token の precondition を実装 |
| 2 | [部員認可分離](2026-09-08-member-authorization-design.md) | Corpus の host policy hook と GLAB schema/policy を実装 |
| 3 | [Cernere WS client 寿命](2026-09-08-cernere-ws-client-lifecycle-design.md) | GLAB owner と `server.ts` cleanup を実装。既存 task scope 外の `server.ts` は新規 task または今回依頼を根拠に追加 scope を管理 |
| 4 | [Corpus token cache](2026-09-08-corpus-token-cache-contract.md) | Corpus repo へ契約を引き渡し。GLAB submodule は直接編集しない |
| 5 | [相談通知の機械認証](2026-09-08-consult-notification-machine-auth-design.md) | Cernere machine token と Corpus service route 契約の提供後に実装 |
| 6 | [旧求人 owner 移行](2026-09-08-legacy-job-owner-migration-design.md) | canonical identity/schema 配備後に dry-run と個別確認。今回はデータを変更しない |
| 7 | [desktop 主経路](2026-09-08-desktop-primary-path-design.md) | 部員認可と配布条件を満たすまで Web を正本に維持 |
| 8 | [Anatomia PR #1510 program layer](2026-09-08-anatomia-pr1510-program-layer-design.md) | module 全体の分類確認後に layers 設定を別実装し gate を再実行 |

## 運用反映

Discord 入力廃止の global / 過去 guild command 同期と新 Bot 反映は
[`spec/interface/discord-commands.md`](../interface/discord-commands.md) の手順に従う。操作がユーザーの明示承認範囲に
あることを確認し、未承認分は承認を得る。Excubitor とプロジェクト本体、Cc claim/release の条件を満たして実施する。
現行 catalog に Bot 個別定義がないため、起動方法を推測しない。本設計作業では登録同期、起動、再起動を行わない。

## 共通受入

- user、member、machine の各認証・認可境界を混ぜず、失敗時に匿名 fallback を作らない。
- 外部 repo の変更は所有 repo の task と review で扱い、GLAB の `corpus/` を直接編集しない。
- migration は dry-run、監査、rollback を備え、名前から identity を推定しない。
- 実装後に各設計文書の受入条件を契約 test と運用確認へ割り当てる。
