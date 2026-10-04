# Vantan プロフィールの編集

## SPEC-GLAB-PROFILE-EDIT-001

- 公開名は Cernere 共通プロフィールの `displayName` を本人が編集する。氏名 (`vantan_user.name`) と分離し、GLab に複製しない。
- `/api/x/vantan-user/public-name` の GET/PUT は認証済み本人に固定。PUT は `publicName` だけを受理し、空白除去後1〜200文字とする。
- Cernere の `profile.get` / `profile.update` を使い、取得要求は `displayName` のみに限定する。Cernere 側の権限拒否を回避したり権限を自己付与したりしない。
- 保存成功後は現在のヘッダー表示も更新する。読み込み・保存失敗は入力欄内で知らせ、再試行できる。
- SteamID・公開設定は既存の本人用 GET/PUT を利用し、登録済み値を変更して保存できる。
- 登録済み顔写真の下にも同意・写真選択・変更ボタンを表示し、既存の写真POSTで差し替える。先行DELETEは行わない。差し替え後の審査は既存のCernere処理に従う。
- メンバー画面・プロフィール画面から、保存先や内部処理についての指定説明文を削除する。

## 確認

- 公開名の本人限定・未知フィールド拒否・文字数・上流失敗の非開示をルートテストで確認する。
- 画面では公開名の再取得と保存、登録済みSteamIDの変更、顔写真の差し替え成功・失敗、ヘッダー更新を確認する。実在ユーザーの名前や写真をテスト目的で変更しない。
- Anatomia plan は既存 `identity-access` を主対象とした。Pf のGLABプロジェクト概要を参照した。
