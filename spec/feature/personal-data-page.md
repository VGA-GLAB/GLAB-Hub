# 個人データ

## SPEC-GLAB-PERSONAL-DATA-001

- 独立した「Cernere設定」ページと `cernere-admin` モジュールを削除する。
- `vantan-user` のIDは維持し、メニュー・画面・パネルの表示名を「個人データ」にする。
- 個人データの入力欄の末尾に「Cernereを開く」リンクを表示する。
- リンク先だけは `CERNERE_WEB_URL` を参照する。Corpusが認証/APIを中継する経路は変更しない。
- `GET /api/x/vantan-user/cernere-link` が正規化済みHTTP(S) URLを返す。資格情報を含むURLは拒否し、値がない場合は503。
- 値はExcubitor Vaultで設定する。利用者向け画面には環境変数名や内部構成の説明を出さない。

### プロフィール未登録時の入力導線 (Cernere opt-out 対応)

- `GET /api/x/vantan-user/profile` は `complete` / `profile` に加えて `profileAccess` と `inputUrl` を返す
  (`cache-control: private, no-store`)。
  - `profileAccess`: `granted` | `denied` | `undecided` | `unknown`。`complete=false` のときだけ
    Cernere `managed_project.get_user_permissions` を照会する。`optedOutModules` に `profile` があれば `denied`、
    `user_data.module:profile` の `state` を採用、`state` の無い旧 Cernere・応答不正・照会失敗は `unknown`。
  - `inputUrl`: `CERNERE_FRONTEND_URL` を基点にした Cernere の「サービスの権限」(`/data-optout`)。
    HTTP(S) かつ資格情報を含まない場合だけ返し、それ以外・未設定は `null`。
- 未登録ゲートの表示:
  - `denied`: 再ログインしても入力画面が出ない旨と、「サービスの権限」で GLAB のプロフィールを許可して
    入力する案内。主ボタン「Cernere で情報を入力する」(新しいタブ、`noopener noreferrer`) と
    「入力したので再読み込み」。
  - それ以外: `inputUrl` があれば主ボタン「Cernere で情報を入力する」と既存の「ログインし直して登録する」を併置。
  - `inputUrl` が `null` なら従来表示 (再ログインのみ)。
- 判定結果も入力値も GLAB に保存しない (正本は Cernere)。
