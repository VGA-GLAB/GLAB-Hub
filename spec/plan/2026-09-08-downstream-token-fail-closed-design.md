# 下流 token 中継の fail-closed 設計

## 決定

`plugins/shared.ts` の user-token 中継は、有効な下流 token が得られない場合に `connector.fetch` を呼ばない。
対象は `authorizedConnectorFetch`、`proxy`、`proxyStream`、`plugins/events/aedilis-client.ts` を通る facility、events、
tirocinium、volputas の user-scoped request である。

| 条件 | 応答 | 下流 fetch |
|---|---:|---:|
| connector base URL 不在 | 503 `connector_unavailable` | 0 |
| incoming user token が空文字・空白 | 401 `downstream_user_token_required` | 0 |
| provider が null・空文字・空白・例外 | 503 `downstream_token_unavailable` | 0 |
| 下流通信失敗 | 502 `connector_error` | 1 |

precondition error は status と code を持つ typed error にし、`proxy` / `proxyStream` が表のとおり写像する。
認証失敗応答には `Cache-Control: no-store` を付ける。body stream を読む前に認証を解決し、失敗時は本文消費も
forward もしない。成功時は incoming `init.headers.Authorization` を信頼せず、取得した Bearer token で必ず上書きする。

token 値、fingerprint、下流本文はエラーへ含めない。connector ID、project key、失敗区分だけを `ctx.logger` または
既存 log adapter へ記録し、新しいログ基盤は増やさない。Aedilis は同じ error を連携失敗へ写像し、匿名再試行しない。
`CORPUS_NO_AUTH=1` でも空 user token は下流 API で 401 にする。

公開 health は対象外とする。progress は user-token provider 契約とは別の固定 machine-token 境界だが、現行は
`CALLIOPE_SERVICE_TOKEN` 不在でも空 headers で `connector.fetch` する。`plugins/progress/connector.ts` が token の
非空・非空白を precondition として検証し、不在時は relay が 503 `service_token_unavailable`、`no-store`、fetch 0 回を
返す契約を同時に実装する。`/health` は公開のまま維持する。Corpus token cache の改善とは独立し、cache 改善前後とも
無効 token を拒否する。

## 実装分担と受入

- `plugins/shared.ts`: precondition、typed error、proxy 応答、Authorization 上書き
- `plugins/events/aedilis-client.ts`: domain error への写像
- `plugins/progress/connector.ts` と relay: 固定 machine token の precondition と503写像
- connector plugin: 利用者表示の整合確認
- tests: null / 空白 / throw / success、stream、mutation の fetch 回数

受入条件は、失敗時 fetch 0 回、成功時 Bearer header 1 個、401/503/502 の区別、progress の token 不在時 fetch 0 回、
公開 health の維持である。

## 参照

- `plugins/shared.ts`
- `plugins/events/aedilis-client.ts`
- `spec/interface/aedilis-connector.md`
- `spec/interface/volputas-connector.md`
