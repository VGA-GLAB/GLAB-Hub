# GLab のシンプルなシェル

## 画面

- Aestimator と Excubitor overview に合わせ、紙色、深緑、細い境界線、余白で構成する。
- ライト／ダーク／端末に合わせるを選択できる。保存対象は端末の配色設定だけ。
- PC は左サイドバー。700px 以下は左から開くメニューとし、横タブへ変えない。
- 開閉ボタンに展開状態を付け、Escape・背景クリック・項目選択で閉じる。開いている間は本文への操作を止め、メニュー内で Tab を循環させる。
- ヘッダーには所属、おれひま、現在地を表示する。狭い画面では状態を次の行へ折り返す。
- パネル共通入力・カードとゲームパネルにも同じ色変数を使う。

## 自分の状態

- `GET /api/x/dashboard/membership`: 認証済み本人の `glab_member.status` だけを返す。
  `active` は在校生、`alumni` は OB、`invited` は招待中、`suspended` は休止中、行がない場合は未登録。
  管理者限定の名簿一覧を開放しない。所属変更は既存名簿管理に任せる。
- おれひまは既存 `GET /api/x/consult/availability` の期限を反映した `availableNow` を参照する。
  受付中／オフを表示し、更新失敗をオフと混同しない。設定操作は既存の相談画面。
- `GET/PUT /api/x/dashboard/location`: 本人申告の学校／自宅／外出先／未設定。
  保存先は GLab 所有の Cernere managed_project user_data `current_location` 列。
  `presence` モジュールの nullable text として追加宣言し、GLab DB・ブラウザには現在地を保存しない。
  PUT は `location: school | home | away | unset` のみ受け付け、unset は null にする。
  本文の userId は受け付けず、全操作を認証済み本人へ固定する。
- 現在地は出席記録、Cocoiru の availability lease、GPS から推定しない。自動取得の要件は別途確認する。
- 状態は30秒間隔、画面復帰、手動更新で読み直す。ページが非表示なら取得を休止する。
  各情報源は独立して失敗を表示し、保存失敗時は前の表示へ戻す。
  ログアウトでタイマー・listener・進行中 fetch を終了する。

## 配信・確認

### SPEC-GLAB-SHELL-010: 更新時のキャッシュ切替

- `npm run build` の最後に `scripts/package-web.mjs` が `public/build/` を作成し、Corpus はこの成果物を配信する。
- HTML 内の GLab JS・CSS・アイコンは内容ハッシュを含む `/vendor/` URL を参照する。同じ package version でも内容が変われば別 URL になる。
- ビルド済みパネルも含むハッシュを HTML の `glab-build` メタデータに持たせ、遅延ロードする GLab パネルの URL に付ける。
- HTML は Corpus の既存 `no-cache` 配信で再検証する。ページ再読込時に新しい HTML と資産へ切り替わる。Cookie・認証情報・テーマ設定は削除しない。
- 資産を書き終えてから HTML を置換し、旧ハッシュの資産は保持する。ソースの HTML/CSS と古い生成 JS を混在させない。
- 開いたままのフォームを自動再読込しない。更新の確認はページ再読込で行う。

- Corpus submodule は変更しない。`theme.css` / `shell.css` は build 時に `public/vendor/` へコピーし、既存の配信経路で読む。
- 変更反映には GLab の web/panel build が必要。dashboard API の追加はマージ後に本体で Excubitor による再起動が必要。
- 確認項目: PC と狭いスマホ、ライト／ダーク／OS連動、メニューのキーボード操作、所属全状態、通信失敗、現在地保存失敗、ログアウト後の更新停止。
