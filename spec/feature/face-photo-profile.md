# feature: プロフィール顔写真の登録と名簿表示

正本仕様は Ostiarius `spec/feature/face-photo-seeded-enrollment.md`。ここでは GLab 側の責務だけを書く。

## 1. GLab は写真を保存しない

- 保存の正本は Cernere (`face_photos`、AES-256-GCM 封緘)。GLab はディスク・DB・キャッシュのいずれにも写真を置かない。
- 表示は Cernere の取得 API を**都度中継**し、応答に `Cache-Control: private, no-store` を付ける。
- 取得は**1 件ずつ**。名簿一覧を開いた時点で全員分を取りに行く口は作らない。職員が行ごとに開いたときだけ引く。

## 2. 認証の分かれ方

| 操作 | 使う資格情報 |
|---|---|
| 同意の記録 / 写真のアップロード / 自分の写真 / 削除 | 本人の access token (`getUserToken`) |
| 職員が名簿で他人の写真を見る | `CERNERE_FACE_PHOTO_TOKEN` (scope `face-photo:read` の tool client token) |

Cernere は写真経路で **project token を明示的に拒否する** (`service-scope-auth.ts`)。GLab の既存 project 資格情報では写真を引けないため、tool client token を別に発行する。未設定時は 503 (fail closed) で、写真は表示されないが他の機能は動く。

## 3. 同意

- 同意文面は Cernere の `GET /api/identity/face-consent/policy` から取得して表示する。**GLab に文面をハードコードしない。**
- 写真経路が要求する版 (`requiredFor` に `photo` を含む版) を選び、その `policyVersion` で同意を記録してからアップロードする。
- 同意が無い / 旧版しか無い場合、Cernere は 409 `consent_required` を返す。UI では同意を先に取る。

## 4. 状態表示

- テンプレートが `pending` の間は「顔認証: 審査待ち」と出す。職員が実機で承認するまで出席照合には載らない。
- 写真が無い生徒は「未登録」。名簿では顔の代わりに状態バッジを出す。

## 5. 出席記録に方法を残す

- Ostiarius の attestation `method` / `assurance` を読み、出席行の `source` に実際の方法を記録する。
- `method` を持たない旧 attestation は従来どおり `passkey`。**既存行は遡って書き換えない。**
- 未知の `method` は落とす (台帳に知らない値を書かない)。
- 出席一覧は方法別のラベル (顔認証 / パスキー / 職員承認 / 手動 …) で出し分ける。

## 6. 受け入れ条件

- GLab 側に写真を保存する経路が無い。
- 写真応答に `private, no-store` が付く。
- 一括取得の口が無い。
- 旧 policyVersion しか同意していない生徒の写真が登録できない (Cernere が 409、UI も同意を先に取る)。
- `method` 付き attestation で `source` が実際の方法になり、`method` 無しでは `passkey` のまま。
