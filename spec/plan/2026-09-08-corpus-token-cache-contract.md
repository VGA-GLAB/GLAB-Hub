# Corpus 下流 token cache 契約

## 決定

Corpus の `CernereProjectTokenProvider` は、現行 cache key（incoming token fingerprint、project key、正規化 audience）を
そのまま in-flight key に使う。同じ key の並行発行は `Map<string, Promise<string | null>>` で一つへ集約し、promise は
成功・失敗・null の全経路で `finally` により除去する。失敗と null は cache しない。

| 項目 | 契約 |
|---|---|
| 有効判定 | 現行どおり期限30秒前から期限切れ扱い |
| 掃除 | get/set 時に期限切れ entry を除去。常駐 timer は追加しない |
| 上限 | 1024 entries。超過時は期限切れを優先し、残れば expiry が早い順に削除 |
| 並行失敗 | waiter 全てへ同じ失敗結果を返し、次回 request は再試行可能 |
| key 分離 | user fingerprint、project、audience のいずれかが違えば共有しない |
| 発行 timeout | token 発行 fetch に上限を設け、timeout 後も `finally` で in-flight を除去 |
| TTL | `expiresIn` は finite かつ正の値だけを cache し、不正値は発行失敗として扱う |

これは Corpus 側の実装契約であり、GLAB の `corpus/` submodule は直接編集しない。GLAB は無効 token を fail closed で
拒否するため、本改善の配備順に認可安全性を依存させない。1024 の妥当性は cache size/eviction/in-flight wait の
既存 logger 指標で確認し、値変更は Corpus 側の運用判断とする。token や fingerprint の実値は記録しない。

## 実装分担と受入

Corpus は `server/hub/tokens.ts` の in-flight、掃除、上限と concurrency tests を担当する。GLAB は契約文書と
fail-closed 境界だけを担当する。受入条件は、同一 key 100並行で発行1回、異なる key は非共有、失敗後に再試行可能、
期限切れが再利用されず、cache が上限を超えて残らないことである。

## 参照

- `corpus/server/hub/tokens.ts`（外部 submodule。参照のみ）
- `spec/plan/2026-09-08-downstream-token-fail-closed-design.md`
