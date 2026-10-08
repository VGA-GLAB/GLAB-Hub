# Odeum: ログイン不要参加と OBS 番組オーバーレイ (GLab 側)

neco (2026-10-09): スマホ参加は **QR + 参加コード (ログイン不要)** と **GLab ログイン** の両方。
OBS 番組へのリアクション合成は **ブラウザソース**。
relay 側の仕様: Odeum `spec/feature/program-overlay-guest-join.md`。
Actio: `actio:af82f06f-582b-4512-8afb-34135ad5dc8c`。

## 招待の値

- 参加コード (10 文字 Crockford base32) と overlay 鍵 (32 byte base64url) は **保存しない**。
  チケット署名鍵 (Vault) から `sha256("glab/odeum-invite/v1" || PKCS#8)` を導き、
  `HMAC-SHA256(secret, "join\0<session id>")` / `"overlay\0<session id>"` で毎回同じ値を作る。
  発表者アプリの再接続・GLab 再起動でも変わらない。署名鍵を差し替えると変わる。
- presenter チケットに `invite: {join, overlay}` (各 SHA-256 base64url) を載せる。
  viewer / service チケットには載せない。relay は hash だけを照合する。

## API

`GET /api/x/odeum/sessions/:id/invitation` (発表者・イベント作成者・管理者 = 終了できる人)。
live でなければ 404。返すのは `joinCode` (ABCDE-FGH12 形式)、`joinUrl`、`joinQr` (PNG data URL)、
`overlayUrl`。コードと鍵は URL fragment に入れ、リクエスト行・リファラに出さない。

## URL の基点

- `ODEUM_GUEST_BASE_URL`: スマホ (同じ Wi-Fi) から届く relay。例 `http://192.168.x.y:4400`。
- `ODEUM_OVERLAY_BASE_URL`: OBS (親機) から届く relay。例 `http://127.0.0.1:4400`。
- どちらも未設定なら `ODEUM_RELAY_URL`。http(s) 以外・query/fragment 付きは招待だけ無効 (503)。
  非 secret なので Excubitor catalog の `env:` に置く。

## 画面

イベントの発表操作に「参加 QR / OBS」を追加。QR・参加コード・参加 URL を表示する。
OBS 用 URL は credential なので「表示」を押したときだけ出し、コピーできるようにする。

## 検証

単体: 値の決定性・セッション/鍵ごとの違い・形式、relay と同じ SHA-256 ベクトル、
presenter 限定の invite claim、URL 基点の解決。実機 (スマホ・OBS) は許可範囲で別に行う。
