# 相談通知の機械認証設計

## 決定

相談通知 worker を利用者 session の `/api/*` gate へ通さず、Corpus が新設する service route 境界へ分離する。
単純な `requireAuth` bypass は行わない。新規契約例は `/service/x/consult/notifications/*` であり、現存 API ではない。
Cernere/Corpus の machine token 対応が依存条件で、利用可能になるまでは通知を degraded として扱う。固定 shared secret で
user gate を迂回する移行経路は採用しない。

Cr が専用 principal `glab-discord-notifier` の project credential から token を発行するよう、既存 credentials を拡張する
新規契約を推奨する。`aud` は GLAB canonical service URL の完全一致、TTL 5分、clock skew 30秒、scope は credential 側で
固定する。`iss`、`sub`、`aud`、`exp`、`jti`、scope、署名 key の active 状態を毎回検証する。credential と署名 key は
新旧並行検証期間を経て rotation する。token に credential generation を持たせ、principal 単独の credential 失効と
署名 key 全体の失効を区別して照会する。失効照会不能は503で fail closed とする。同じ token の期限内再利用は許可し、
`jti` は失効照会の識別に使う。ACK の重複排除は delivery ID で行う。失効した旧 generation が401、新 token だけ成功する
ことを検証する。token や credential はログへ残さない。

| scope | 許可 |
|---|---|
| `consult.notification.read` | `GET /service/x/consult/notifications/pending` と `/resolved` |
| `consult.notification.ack` | `POST /service/x/consult/notifications/:id/posted` と `/:id/resolved-posted` |
| 上記以外 | 拒否。presence resolve/write、相談本文更新、部員 API を含む |

ACK は notification ID と delivery ID を受け、同一組の再送は 200 `{ applied: false }`、初回は 200
`{ applied: true }`、別内容との衝突は 409 とする。Discord 配信と DB ACK の原子的 exactly-once は保証できない。
worker は送信前 intent を journal へ保存し、配信後に Discord message ID と confirmed を保存してから ACK する。配信成功から
confirmed 保存までの crash window は残るため、利用者向け契約は at-least-once とする。

## 分担と受入

- Corpus/Cernere: machine token 発行・検証、user route と分離した service route 登録 API
- GLAB consult: notification read/ack のみを service route へ移し、presence route は移さない
- bot worker: scoped token、delivery journal、idempotency key

受入条件は、service token だけで user API は使えず、user cookie だけで service API は使えず、scope 外は403、期限切れは
401、発行・検証障害時は fail closed、同一 ACK 再送が副作用を重ねず、presence が service scope から到達不能であることとする。

## 参照

- `plugins/consult/index.ts`
- `bot/glab-api.ts`
- `spec/plan/problem_logs/2026-09-08-discord-input-retirement.md`
