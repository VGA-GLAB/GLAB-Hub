# 設計後9件の実装・運用状態

2026-09-08。設計後taskの原本 fed9a70 を変更せず、9ファイルを実装branchへ収録した。
ユーザー指定により操作画面もTelaで構成する。Tela–Orbis連携は所有側からの提供待ち。
今回の成果はレビュー用コードと契約引渡しであり、稼働・配布・データ移行の完了ではない。

| 元task | 今回の成果 | 残条件 |
|---|---|---|
| 外部契約引渡し | Corpusへ4件、Cernereへ1件の新規task | 所有repoでの受入・実装 |
| 部員認可 | 共通host policy hookの受入条件を引渡し | Corpus契約提供後、GLAB DB/policy/API/UI実装と両入口検証 |
| 相談通知の機械認証 | 専用principalとservice route契約を引渡し | Cernere→Corpus→GLAB通知journal/認可の順で実装 |
| 求人owner移行機構 | nullable owner/revision、証跡分類、admin API/UI、CLI、CAS監査・rollback | 配備前の動作検証 |
| 確認済み求人データ移行 | classify/dry-run/apply/rollbackの運用手順 | 証跡確認、バックアップ、配備、実DB操作承認と実施 |
| desktop shell | Tela native UI、Windows常駐host、ネイティブ入力、GLAB側bridge要求 | 実Tela–Orbis adapter、実行ファイルの組込み、認証・終了・DPI等の実機検証 |
| desktop段階配布 | 下記配布gateを定義 | 署名済み成果物、pilot、観測と段階配布 |
| Cr client終了処理 | 6plugin共有owner、rotation/revoke、terminal close、signal/init失敗cleanup | Corpus内部hard exit解消と動作検証 |
| Calliope token欠落送信停止 | 送信前503/no-store、固定token優先、公開health匿名、例外detail抑止 | 動作検証 |

## 静的検査と制限

- 変更・追加TypeScript 27ファイルをstrict/noEmitで検査し診断0。アプリコードは実行していない。
  worktreeの未展開corpusはgitlink一致の本体ソースをread-only参照、依存は本体node_modules、
  node:sqliteの型は既存Node22型定義を使用した。通常のclean install全体buildとは異なる。
- Tela本体headerとnlohmann/json v3.12.0公式headerを参照し、C++20/Windowsの5翻訳単位を
  clang++ -fsyntax-onlyで検査。リンク、実行ファイル生成、画面操作は未実施。
- git diff --check。テストコードは追加・更新したが実行していない。
- テスト・起動・再起動・実DB更新・サービス配備・merge・main更新は未実施。

## 求人データ移行 gate

1. 管理者が対象DB、運用actor、旧投稿者とcanonical user IDを結ぶ証跡を確認する。
2. バックアップの取得・復元手順を確定し、owner schema/APIを配備する。
3. read-only分類とdry-runを保存する。Discord名・曖昧な一致は未解決のまま扱う。
4. 明示承認済み入力だけapplyし、行ごとのaudit IDとrevisionを突合する。
5. 部分失敗は成功行と分けて扱う。必要なrollbackは元auditを指定し、後続変更があれば停止する。

## desktop配布 gate

1. 正式なTela–Orbis連携APIとGLAB HTTPS originを受領し、HubBridge実装を接続する。
2. 本体フォルダ・Excubitor経由の検証について明示許可を受け、Concordiaへclaim/releaseする。
   ログイン、失効、権限制御、出席passkey、二重起動、tray終了、通信断、DPIを確認する。
3. 署名主体、installer/update/uninstall、データ保持範囲、戻す版を確定する。
4. 少人数pilotで認証・更新失敗と終了処理を観測する。問題時は配布を止めbrowser導線へ戻す。
5. pilot受入後に段階配布する。移行期間は既存browser導線を維持する。

既存Electron設計に対する変更理由とbridge要求は `2026-09-08-tela-orbis-desktop.md`、
所有repoへの依存引渡しは `2026-09-08-external-contract-handoff.md` を参照する。
