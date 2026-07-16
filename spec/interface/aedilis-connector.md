# interface/ — Aedilis コネクタ（施設）

施設予約（`facility`）モジュールは Corpus の connector（id `aedilis`、`scope: 'multi'`、
`baseUrl = AEDILIS_BASE_URL`）越しに Aedilis のバックエンドへ中継する。
イベントモジュールは GLAB PostgreSQL に施設マスタを持ち、Aedilis の施設一覧は未登録施設の
候補表示にだけ使う。候補がイベントで初めて選択された時点で GLAB 施設マスタへ昇格する。
`user_id` と現在の出席状況はこのコネクタを使わず、GLAB の `glab_user` が正本を持つ。

## 中継方式（`plugins/shared.ts` の `proxy`）

- メソッド / クエリ文字列 / ボディを転送する。`Authorization` はログイン中ユーザの
  Cernere access token から Aedilis 用 project token を発行して付与する。
- レスポンスの status / `content-type` を透過して返す。
- connector が例外（接続失敗等）を投げた場合は `502 { error: 'connector_error', connector, detail }`。
- `baseUrl` 空（`AEDILIS_BASE_URL` 未設定）のとき `HttpServiceConnector` が `503` を返し、
  パネルが「未接続（degraded）」を表示する。

## マッピング（hub ルート → Aedilis API）

### `facility`（`plugins/facility/index.ts`）
| hub ルート | Aedilis | 用途 |
|---|---|---|
| `GET /facilities` | `GET /api/facilities` | 施設一覧 |
| `GET /facilities/:id` | `GET /api/facilities/:id` | 施設詳細 |
| `GET /reservations` | `GET /api/reservations` | 予約一覧（`?facility=&from=&to=`） |
| `GET /reservations/mine` | `GET /api/reservations/mine` | 自分の予約 |
| `POST /reservations` | `POST /api/reservations` | 新規予約 `{facilityId,startAt,endAt,purpose?}` |
| `DELETE /reservations/:id` | `DELETE /api/reservations/:id` | 予約キャンセル |

## イベント連動

- `GET /api/x/events/facilities` は GLAB 施設マスタと Aedilis 候補を分けて返す。
- `POST /api/x/events/events` は Aedilis 予約を先に作り、成功時だけ GLAB イベントを保存する。
- GLAB 保存失敗時は作成済み予約を best-effort で取り消す。
- イベント削除時は Aedilis 予約を取り消してから GLAB イベントを削除する。
- 固定の `AEDILIS_SERVICE_TOKEN` は使用しない。

## 関連

- 機能: [`feature/facility.md`](../feature/facility.md)
- 設定: [`setup/environment.md`](../setup/environment.md)
