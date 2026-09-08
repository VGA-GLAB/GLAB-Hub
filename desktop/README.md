# GLAB Tela desktop

2026-09-08 neco 指示により、操作画面も Tela に統一する。Windows 常駐 host と Tela の
ホーム・プロフィール・求人・予定・相談・出席 UI を `GLAB::Desktop` ライブラリとして提供する。
画面描画は Tela/Pictor、文字入力は Tela の既存 example と同様に native text editor adapter を使う。
閉じる操作は tray へ収納し、tray の明示終了で window/renderer/通信を解放する。
二重起動は同一 Windows session の既存画面を前面へ戻す。非通信待機時には timer を持たない。

## 接続境界

neco が用意する Tela–Orbis 連携に合わせ、具体的な transport adapter を接続する。
`include/glab/hub_bridge.hpp` は GLAB が要求する C++ 接続口であり、Tela/Orbis の提供済み wire API ではない。
**実 adapter・認証接続・起動 executable は未提供。現状は配布可能な完成アプリではない。**

`HubBridge` は認証、同一 origin の既存 Hub API、passkey 出席、browser 復旧、session 失効通知、
pending の中断を提供する。実 adapter を渡して UI thread から `runResident(bridge, font)` を呼ぶ。
認証済み identity は `/api/me` と同じ schema。cookie/access token/refresh token は Orbis が所有し、
GLAB native UI へ渡さない。logout/identity変更/切断では表示データと保留操作を破棄する。
`cancelAll` は GLAB が発行した操作だけを対象とし、他の Orbis 利用者を停止しない。

HTTP 401/403/409/429/5xx を明示表示し、匿名 fallback や書込の自動再送を行わない。
native のボタン制御に加え、本人・部員・admin/owner の最終判定は Hub 側が行う。
初回プロフィールが未完了なら編集画面へ案内する。出席は既存 Ostiarius/passkey 検証を経由する。
Tela–Orbis の API、配布用 HTTPS origin、署名 installer、font 配布ライセンスを確定してから接続・配布する。

## ビルド依存

CMake 3.20、C++20、インストール済み Tela (Core/Pictor)、nlohmann_json 3.11 以降 (MIT)。
`find_package` で依存を解決し、sibling source のハードコードや自動ダウンロードはしない。
起動側は per-monitor DPI v2 と bridge の UI thread 配送を設定する。

```text
cmake -S desktop -B desktop/build -DCMAKE_PREFIX_PATH=<Tela と nlohmann_json の install prefix>
cmake --build desktop/build --config Release
```

アプリ・テストの起動は Session ポリシーに従い、本体フォルダから Excubitor 経由でのみ行う。
今回の静的検査では nlohmann/json 3.12.0 の公式ヘッダと現行 Tela ヘッダを使用し、実行はしていない。
