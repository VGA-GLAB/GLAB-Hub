# 個人データ

## SPEC-GLAB-PERSONAL-DATA-001

- 独立した「Cernere設定」ページと `cernere-admin` モジュールを削除する。
- `vantan-user` のIDは維持し、メニュー・画面・パネルの表示名を「個人データ」にする。
- 個人データの入力欄の末尾に「Cernereを開く」リンクを表示する。
- リンク先だけは `CERNERE_WEB_URL` を参照する。Corpusが認証/APIを中継する経路は変更しない。
- `GET /api/x/vantan-user/cernere-link` が正規化済みHTTP(S) URLを返す。資格情報を含むURLは拒否し、値がない場合は503。
- 値はExcubitor Vaultで設定する。利用者向け画面には環境変数名や内部構成の説明を出さない。
