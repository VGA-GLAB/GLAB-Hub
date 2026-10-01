# Cocoiru バックエンド (`cocoiru` モジュール)

- タスク参照: actio:13255642-d643-4a10-8641-2315d39833a6
- 実装: `plugins/cocoiru/index.ts` (ルート) / `plugins/cocoiru/store.ts` (SQL) / `plugins/data.ts` `ensureCocoiruSchema` (テーブル)

## 目的

デスクトップ常駐アプリ **Cocoiru** の在席共有・呼び出し・タスケテ・Discord ロビー共有を、
GLAB-Hub をバックエンドとして処理する (2026-10-01 決定「GLab にバックエンドを持ちそこで処理する」)。
Web 画面 (panel) は持たない。API だけを提供する。

## Cocoiru 側の接続方法

Cocoiru の常駐プラグインは設定された GLAB URL から次を導出する。

- ベース URL: `<GLAB>/api/x/cocoiru`
- groupId: `"glab"`

認証は GLAB の他モジュールと同じ (Corpus 認証済み = メンバー)。本人は `getIdentity(c).userId`。

## API 契約

すべて `/api/x/cocoiru/resident/:groupId/...`。Cocoiru 側が既にこの形で話しているので変えない。

- groupId は `glab` のみ受け付ける。それ以外は 404。
- 本文は 8 KiB まで (超過は 413、JSON でなければ 400)。
- 時刻は ms (`createdAt`)。`expiresAt` だけ ISO 文字列。
- 応答はすべて `Cache-Control: private, no-store`。

| メソッド / パス | 入力 | 応答 |
| --- | --- | --- |
| `PUT /availability` | `{available: boolean}` | lease を upsert (期限 = now + 30 秒)。期限切れの lease と call を掃除。`{ok: true, leaseSeconds: 30}`。boolean 以外は 400 |
| `GET /available` | — | 有効 (available=1 かつ期限内) な `[{userId}]` を最大 100 件 |
| `POST /calls` | `{recipientId, title(1..120), body(0..1000)}` | 相手が有効な lease を持たなければ 409。相手の未失効 call が 20 件以上、または同じ送信者が 10 秒以内に同じ相手へ送っていれば 429。kind=`call`、期限 = now + 5 分。`201 {id}`。不正は 400 |
| `GET /inbox` | — | 自分宛ての未失効 call を `createdAt` 昇順で最大 20 件。各要素 `{id, title, body, expiresAt, kind, senderId, createdAt}` |
| `DELETE /inbox/:id` | — | 自分宛てのその call だけ削除 (他人宛ては消さない)。`{ok: true}` |
| `POST /tasukete` | `{text(1..500、trim 後空不可)}` | 送信者が 60 秒以内に tasukete を送っていれば 429。送信者以外の有効 lease 全員へ kind=`tasukete`、title=`タスケテ`、body=text、期限 = now + 5 分の call を一括作成。0 人なら 409。`201 {sent: n}` |
| `GET /discord-lobby` | — | 1 行だけの secret (無ければ `randomBytes(32)` の hex を作って保存。同時初回でも 1 つに収束) を `{secret}` で返す |

## テーブル (SQLite、`data/corpus.db`)

- `glab_cocoiru_availability(user_id PK, available 0/1, expires_at)` + index(`expires_at`)
- `glab_cocoiru_call(id PK, sender_id, recipient_id, title, body, kind CHECK('call','tasukete'), created_at, expires_at)`
  + index(`recipient_id, expires_at`) + index(`sender_id, kind, created_at`)
- `glab_cocoiru_lobby(id INTEGER PK CHECK(id=1), secret, created_at)`

## 保持期間

- 在席 lease: 30 秒。Cocoiru は定期的に `PUT /availability` で更新する。期限切れ行は次の `PUT /availability` で削除。
- call / tasukete: 5 分。受信者の `DELETE /inbox/:id` か、期限切れ後の `PUT /availability` で削除。
- ロビー secret: 無期限 (1 行のみ)。

## 個人情報

名前・役職・学科などは保存しない (Cernere `vantan_user` が単一情報源)。保存するのは
Cernere `user_id`・期限・呼び出しのタイトルと本文だけ。表示名の解決は Cocoiru 側の責務。

## テスト

- `tests/cocoiru-store.test.ts`: 実 SQLite で lease 期限・受信箱・ack・タスケテ・ロビー secret を確認
- `tests/cocoiru-contract.test.ts`: ソース上の 409/429、groupId `glab` 限定、no-store を確認
