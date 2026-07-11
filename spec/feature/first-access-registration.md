# feature/ — GLAB 初回アクセス登録

## 挙動

1. 認証後にユーザーが任意の GLAB パネルを開く。
2. 共通 panel gate が `GET /api/x/vantan-user/profile` を呼ぶ。
   この時点で GLAB SQLite の `glab_user` に Cernere `user_id` の参照行を冪等確保する。
3. GLAB server は Cernere に `project_credentials` で接続し、
   `managed_project.get_user_data` の `targetProjectKey=vantan_user` で必須 3 列を取得する。
4. 3 列がすべて入力済みなら、そのまま対象パネルを描画する。
5. 不足があれば名前・役職・学科のフォームを表示し、通常パネルをまだ描画しない。
6. 登録時は `managed_project.set_user_data` を `targetProjectKey=vantan_user` 付きで呼び、
   Cernere が `readwrite` grant と `profile` module を検査して upsert する。

## 失敗時

- Cernere 不達、project credential 不正、grant 不足は登録を迂回しない。
- パネルに接続確認メッセージを表示し、プロフィールや credential の値は出さない。
- 必須環境変数不足は GLAB 起動時に fail-fast する。

## 完了条件

- 初回ユーザーは名前・役職・学科を登録するまで各パネルを利用できない。
- 登録済みユーザーは追加入力なしで各パネルを利用できる。
- 保存先は Cernere のみで、GLAB SQLite に個人プロフィール列を追加しない。
