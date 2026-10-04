# 組織・チームの施設／会議予約

SPEC-GLAB-BOOKING-001。necoの2026-10-04指示：Aedilis接続、組織・チーム対応、要ログイン、予約単位のPublic/Internal/Private、予定コピー。

## 利用と受入条件

- GLabの施設・会議予約はログイン必須。組織はCernereの本人所属、チームはGLabの所属中の制作プロジェクト。
- Publicは誰でも閲覧、Internalは指定した組織・チームの現在の所属者、Privateは予約者本人。作成者は所属脱退後も自分の予約を取り消せる。
- 新規フォームの初期値はPrivate。公開範囲は予約・会議ごとに編集可能。
- コピーは閲覧できる予定から新しい下書きを作る。保存時に本人・所属を再確認し、新規IDで作成。回答・所有者・確定状態は引き継がない。所属のないInternalをコピーする場合はPrivateに戻す。
- 会議は複数日時候補、参加回答、日時確定、中止を扱う。施設指定候補の確定時はAedilisが施設予約を原子的に作成し、重複なら確定しない。編集・中止でその予約を解除する。

## 正本と認可

予約・会議・公開範囲はAedilisが正本。GLabには予約のコピーを保存しない。GLab backendは本人のCernere user credentialで所属組織を読み、GLab DBの制作プロジェクト所属と合わせる。利用者のgroup名やowner指定は権限根拠にしない。

GLabからAedilisへの本人トークンは既存TokenProviderで発行。所属の証明はVaultの共通鍵 `GLAB_AEDILIS_CONTEXT_SECRET` で署名し、本人ID・HTTP method・path/query・本文SHA-256・30秒の有効期限に結び付ける。利用者が送った署名ヘッダーは転送しない。秘密値はログ・ソースに保存しない。

`GET /api/reservations/capabilities` の `groupContextVersion: 1` を確認し、未対応版への操作は503で停止する。所属取得失敗・署名鍵欠落・トークン取得失敗を公開予約や匿名アクセスへフォールバックさせない。閲覧・詳細・回答・コピーの元データをAedilis側で保護する。

## 検証

GLabの型チェック・ビルド。Revisor用テスト：匿名拒否、旧APIへの書込拒否、署名の本人／リクエスト結合、所属取得失敗。Aedilis側では署名改ざん・期限・脱退・非公開・会議確定と施設予約の原子性を検証する。実アカウントによるブラウザ確認は未実施。

Anatomiaのplanで既存facility-reservation／identity-accessを確認。whereはlandingなし。全体verifyは登録main索引への評価でありworktreeの実行確認ではない。typescript-language-serverは端末のコマンドとして見つからず、参照確認はソース検索を使用した。
