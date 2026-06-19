# interface/ — Aedilis コネクタ（出席 / 施設）

出席（`attendance`）と施設（`facility`）モジュールは**自前データを持たず**、
Corpus の `HttpServiceConnector`（id `aedilis`、`scope: 'multi'`、`baseUrl = AEDILIS_BASE_URL`）越しに
Aedilis のバックエンドへ中継する。Aedilis が真実の源（出席は Ostiarius の passkey チェックインで生成）。

## 中継方式（`plugins/shared.ts` の `proxy`）

- メソッド / クエリ文字列 / ボディ / `Authorization` ヘッダを**そのまま転送**する。
  → 接続先 Aedilis がユーザの Cernere トークンで認可する（ユーザ権限を保存）。
- レスポンスの status / `content-type` を透過して返す。
- connector が例外（接続失敗等）を投げた場合は `502 { error: 'connector_error', connector, detail }`。
- `baseUrl` 空（`AEDILIS_BASE_URL` 未設定）のとき `HttpServiceConnector` が `503` を返し、
  パネルが「未接続（degraded）」を表示する。

## マッピング（hub ルート → Aedilis API）

### `attendance`（`plugins/attendance/index.ts`）
| hub ルート | Aedilis | 用途 |
|---|---|---|
| `GET /mine` | `GET /api/checkin/mine` | 自分の出席履歴 |
| `GET /list` | `GET /api/checkin` | 出席一覧（admin、`?facility=&from=&to=`） |
| `GET /facilities` | `GET /api/facilities` | 施設名ラベル解決 |

### `facility`（`plugins/facility/index.ts`）
| hub ルート | Aedilis | 用途 |
|---|---|---|
| `GET /facilities` | `GET /api/facilities` | 施設一覧 |
| `GET /facilities/:id` | `GET /api/facilities/:id` | 施設詳細 |
| `GET /reservations` | `GET /api/reservations` | 予約一覧（`?facility=&from=&to=`） |
| `GET /reservations/mine` | `GET /api/reservations/mine` | 自分の予約 |
| `POST /reservations` | `POST /api/reservations` | 新規予約 `{facilityId,startAt,endAt,purpose?}` |
| `DELETE /reservations/:id` | `DELETE /api/reservations/:id` | 予約キャンセル |

## サービス間 Bearer（任意）

`AEDILIS_SERVICE_TOKEN` を設定すれば Aedilis 連携にサービス間 Bearer を使える（`.env.example` のコメント）。
未設定ならユーザ Bearer（Cernere トークン）を透過する。

## 関連

- 機能: [`feature/attendance.md`](../feature/attendance.md) / [`feature/facility.md`](../feature/facility.md)
- 設定: [`setup/environment.md`](../setup/environment.md)
