# GLab-Hub v0.2 実装計画書

> 分類: plan。[glab-hub-v0.2.md](./glab-hub-v0.2.md) (仕様書) を実装フェーズに分解する。
> 各フェーズは「設計済み機能をフルセットで実装・配線・検証して完了」する単位であり、
> スタブや最小縦切りを作らない。1 フェーズ = 1 PR (AI 実装は 1 PR 集約) を原則とする。

## フェーズ一覧と依存関係

```
Phase 0 (基盤)
  ├─▶ Phase 1 (出席コア: Ostiarius 内包 + passkey)   ← ここまでで「GLab+Cernere で出席確認」成立
  │      └─▶ Phase 2 (COCOIRU 常駐 agent 直結)
  ├─▶ Phase 3 (役職 + フォーラム)
  │      └─▶ Phase 4 (イベントスケジュール拡張)      ← audience 可視性規則を Phase 3 から流用
  └─ ─ ─ ▶ Phase 5 (顔認証・動体検知; 実験的, 前提条件ゲートあり)
```

Phase 1 と Phase 3 は独立して並行可能。Phase 2 は Phase 1 の `glab_attendance` に依存。
Phase 4 は Phase 3 の audience 規則に依存。Phase 5 は Phase 1 安定運用 + Ludellus 側
前提条件 (face-attendance.md §前提条件) の充足が着手ゲート。

---

## Phase 0 — 基盤整備 (GLAB リポ)

**目的**: v0.2 の全フェーズが乗る土台 (submodule・スキーマ・起動配線) を先に固める。

| # | タスク | 変更対象 |
|---|---|---|
| 0-1 | Ostiarius を submodule 追加 (`ostiarius/`)。CLAUDE.md の「触らない」対象に追記 | `.gitmodules`, `ostiarius/`, `CLAUDE.md` |
| 0-2 | `plugins/data.ts` に v0.2 スキーマ追加: `glab_attendance` / `glab_gateway` / `glab_floor_map` / `glab_member_role` / `glab_role_def` / `glab_forum_thread` / `glab_forum_comment`、`glab_event` への ALTER (ends_at / audience_roles / recurrence)。クエリ関数一式 | `plugins/data.ts` |
| 0-3 | 起動配線: `npm run dev` = hub + Ostiarius の concurrently 起動。Ostiarius への env 注入 (`OSTIARIUS_*`)。片方死亡時の再起動方針を README に明記 | `package.json`, `server.ts`(必要なら), `README.md`, `spec/setup/environment.md` |
| 0-4 | vitest 導入 + `plugins/data.ts` の実 SQL 経路テスト (spec/test/strategy.md の最優先項目を本フェーズで消化: 新テーブル CRUD + WAL 2 接続冪等) | `package.json`, `tests/data.test.ts` |
| 0-5 | spec 更新: `spec/data/` に glab-attendance.md / glab-forum.md / glab-roles.md を追加、`spec/setup/hub.md` に submodule 手順追記 | `spec/data/*`, `spec/setup/*` |

**完了条件**: `npm run dev` 一発で hub(:5187) + Ostiarius(:17590) が起動し、
`ensureSchema` が新テーブルを冪等作成。vitest green。

**リスク/対策**: Ostiarius は独自 `package.json` を持つ → ルートから
`npm --prefix ostiarius install` を setup スクリプト化。submodule の未初期化ディレクトリで
git コマンドが親リポに落ちる罠 (既知) → README の clone 手順に `--recurse-submodules` 明記。

---

## Phase 1 — 出席管理コア (passkey / モバイル → glab_attendance)

**目的**: 「GLab と Cernere を起動すると出席確認ができる」を成立させる。

| # | タスク | 変更対象 |
|---|---|---|
| 1-1 | attestation 検証モジュール: base64url(payload).sig の Ed25519 検証 + `glab_gateway` 公開鍵引き + nonce 一意 (使用済み nonce テーブル or TTL キャッシュ) + issuedAt 鮮度 (±5 分) | `plugins/attendance/attestation-verify.ts` |
| 1-2 | attendance プラグイン全面改修: `POST /checkin` (attestation 受領→検証→記録)、`GET /mine`、`GET /list` (admin, 日付/施設絞込)、`GET /summary` (admin, 日別集計)。Aedilis proxy 経路は削除 | `plugins/attendance/index.ts` |
| 1-3 | gateway 登録: 起動時に Ostiarius `GET /gateway-public-key` を叩いて `glab_gateway` へ自己登録 (Aedilis の self-register と同型)、または admin API で手動登録 | `plugins/attendance/`, `server.ts` |
| 1-4 | attendance パネル改修: passkey チェックインボタン (Ostiarius begin/finish → attestation → hub へ提出) + 自分の履歴 + admin 一覧/集計。会場 LAN 外では Ostiarius 到達不可 → 「会場外」表示の degraded 対応 | `plugins/attendance/panel.ts` |
| 1-5 | モバイルフォールバック動作確認: Ostiarius mobile-checkin → attestation → 1-2 の `/checkin` に合流 (`source="mobile"`) | (Ostiarius 既存 + 1-2) |
| 1-6 | Discord 通知 (任意): 当日初チェックインを `#attendance` に通知するスケジューラ拡張 | `bot/notify/scheduler.ts` |
| 1-7 | テスト: attestation 検証の単体 (正常/偽署名/期限切れ/nonce 再利用) + checkin API の統合 (vitest) | `tests/attendance.test.ts` |

**完了条件**: Cernere + GLab のみ起動した状態で、passkey チェックイン → hub の出席一覧に
表示、まで一気通貫。重複チェックインが UNIQUE で 1 件に丸まる。偽 attestation が 401。

**関連リポ作業**: Ostiarius 側の変更は原則不要 (既存 API をそのまま使う)。
`AEDILIS_BASE_URL` 無しでも警告を出さない起動オプションが必要なら Ostiarius 側 PR。

---

## Phase 2 — COCOIRU 常駐エージェント直結 (自動ログイン + 自動出席)

**目的**: PC を起動しているだけで出席が付く経路を追加する (要件 2)。

| # | タスク | 変更対象 |
|---|---|---|
| 2-1 | presence プラグイン新設: `POST /heartbeat` (WiFi 観測受信 → confidence 返却)、`POST /auto-checkin` (`source="cocoiru"` で記録)、`GET /connected` (直近 5 分の在席一覧)、floor map CRUD (admin)。COCOIRU `presence-resolver.ts` / `wifi-resolver.ts` を移植 | `plugins/presence/` |
| 2-2 | B1 互換受け口: `POST /api/attendance/auto-checkin` (COCOIRU server の glab-hub-bridge 契約: userId/floor/building/room + Bearer) を presence プラグインで受ける | `plugins/presence/` |
| 2-3 | glab-agent: Cocoiru `apps/desktop-agent` をベースに GLab 送信先対応 — 設定 `hubBaseUrl`、`ensureCernereSession` 流用、heartbeat/auto-checkin を GLab-Hub の新 API へ | Cocoiru リポ (または GLAB `agent/` にフォーク。判断は着手時に neco 確認) |
| 2-4 | agent セキュリティ強化: refresh token の DPAPI 暗号化保存 / 対話式 `setup` (平文 password 非永続) / 二重起動ガード (lock file) | 同上 |
| 2-5 | agent 常駐化: `agent install` = Windows タスクスケジューラ登録 (ログオン時起動 + 失敗時再起動)、`agent uninstall`。ログのファイル出力 + ローテーション | 同上 |
| 2-6 | presence パネル: 在席中メンバー一覧 (フロア別)。attendance パネルに「自動出席 (cocoiru)」の source 表示 | `plugins/presence/panel.ts` |
| 2-7 | テスト: presence-resolver 移植分の単体 (floor 突合/confidence)、auto-checkin 冪等の統合 | `tests/presence.test.ts` |

**完了条件**: 学内 WiFi に接続した PC で agent が無人ログイン → heartbeat →
confidence≥50 で当日出席が自動記録。PC 再起動でも二重記録されない。
在席一覧パネルに表示される。

**リスク/対策**: refresh token ローテーションの多重共有失効 → 二重起動ガード必須 (2-4)。
Cernere trusted_devices の異常検知でメール確認要求が出る可能性 → 初回 setup を
本人の対話で行い、その端末を通常環境化してから常駐に入る運用を README に明記。

---

## Phase 3 — 役職モデル + 情報共有フォーラム

**目的**: 役職ごとの情報共有の土壌 (要件 5) + 投稿フォーラム (5-1)。

| # | タスク | 変更対象 |
|---|---|---|
| 3-1 | roles プラグイン新設: `glab_role_def` CRUD (admin)、`glab_member_role` 付与/剥奪 (admin)、`GET /me` (自分の役職)、`GET /members` (役職別メンバー一覧)。既定役職セット (lead/planner/programmer/designer/student) を初期投入 | `plugins/roles/` |
| 3-2 | 役職解決ヘルパ: `resolveRoles(db, userId)` + audience 可視性判定 `canSee(audienceRoles, userRoles, isOwner, isAdmin)` を共有化 (forum / events 双方が使う) | `plugins/shared.ts` or `plugins/roles/audience.ts` |
| 3-3 | forum プラグイン新設: スレッド CRUD (`POST /threads`, `GET /threads?role=&q=`, `GET /threads/:id`, `DELETE`, admin ピン留め) + コメント (`POST /threads/:id/comments`, `GET`)。一覧/詳細はサーバ側 audience フィルタ必須 | `plugins/forum/` |
| 3-4 | forum パネル: 役職タブ + スレッド一覧 (ピン留め上位/検索) + スレッド詳細 + コメント欄 + 投稿フォーム (audience_roles 選択)。jobs パネルを雛形に拡張 | `plugins/forum/panel.ts` |
| 3-5 | roles 管理パネル: メンバー×役職のマトリクス編集 (admin のみ表示, `requires: admin`) | `plugins/roles/panel.ts` |
| 3-6 | Discord 通知: 全員向け新着スレッドを `#forum` へ (notified_at 方式)。役職限定は通知しない | `bot/notify/scheduler.ts` |
| 3-7 | テスト: audience 可視性 (交差/空/投稿者/admin の 4 象限)、役職付与→一覧反映の統合 | `tests/forum.test.ts`, `tests/roles.test.ts` |

**完了条件**: admin が役職を付与 → 役職限定スレッドが該当役職にのみ表示され、
API 直叩きでも他役職には返らない。コメント往復・ピン留め・Discord 通知が動く。

---

## Phase 4 — イベントスケジュール共有の拡張

**目的**: イベントの「共有」体験を仕上げる (要件 6)。

| # | タスク | 変更対象 |
|---|---|---|
| 4-1 | `glab_event` 拡張の配線: ends_at / audience_roles / recurrence(none\|weekly) を API (POST/GET) に反映。recurrence=weekly は一覧/リマインダで直近発生日に展開 | `plugins/events/index.ts`, `plugins/data.ts` |
| 4-2 | events パネル: 週間スケジュールビュー (日別グルーピング、当週/翌週切替) + audience フィルタ | `plugins/events/panel.ts` |
| 4-3 | Discord `/event add` に終了時刻/毎週オプション追加。リマインダは audience 限定イベントをスキップ | `bot/commands/event.ts`, `bot/notify/scheduler.ts` |
| 4-4 | テスト: recurrence 展開・audience フィルタの単体 | `tests/events.test.ts` |

**完了条件**: 週間ビューで役職に応じたイベントが見え、毎週イベントが翌週も表示され、
リマインダが期日前に飛ぶ。

---

## Phase 5 — 顔認証・動体検知 (実験的; 着手ゲートあり)

**仕様**: [spec/feature/face-attendance.md](../feature/face-attendance.md)

**着手ゲート (全て満たすまで着手しない)**:
1. Phase 1/2 の出席運用が安定 (誤記録・重複の報告ゼロで 2 週間)
2. Ludellus 側: OpenCV 実映像検証 / Cernere /ws/project 実配線 / SFace alignCrop 実装
3. 同意フロー (出席目的 policyVersion + 未成年運用) の文面確定 (neco 承認)

| # | タスク | 変更対象 |
|---|---|---|
| 5-1 | Cernere: `project_data_glab` プロジェクト定義 + `biometric_face` 列 (Ludellus PR #129 と同型 migration) | Cernere リポ PR |
| 5-2 | glab-face-agent: Ludellus native tracking/identity 流用のスタンドアロン常駐 (カメラ端末)。名簿 gallery 常駐化 + 強化閾値 (accept 0.45 / margin 0.10 / min_votes 10 起点) + 入退室 FSM マッピング | 新規 (置き場所は着手時判断: GLAB `face-agent/` or 別リポ) |
| 5-3 | GLab-Hub: `POST /api/x/attendance/checkin` に `source="face"` 受け入れ + シャドー運用フラグ (draft 記録は本記録に昇格させない) | `plugins/attendance/` |
| 5-4 | enroll UI + 同意 UI: hub パネルから顔登録 (撮影→埋め込み→Cernere 保存)、opt-out 導線 | `plugins/attendance/` or 専用プラグイン |
| 5-5 | シャドー運用 → 精度レポート → 閾値確定 → 本運用昇格 | 運用 |

**完了条件 (シャドー)**: ラボ入口カメラで enroll 済みメンバーの入室が draft 記録され、
passkey 記録との一致率がレポートできる。誤束縛 (別人への出席付与) ゼロを本運用昇格条件とする。

---

## 横断事項

- **ブランチ/PR**: フェーズごとに `feat/v0.2-phase<N>-<slug>` → PR → CI green → squash merge。
  spec 変更を伴う場合は同 PR に含める (spec と実装の乖離を作らない)。
- **検証**: 各フェーズの完了条件は手動 E2E + vitest の双方。dev server の再起動を伴う検証は
  Excubitor 経由 + Concordia claim (cc-test 運用) に従う。
- **設定**: 新規 env は `spec/setup/environment.md` の表に追記。シークレットは暗号化 config
  または Infisical (平文 .env へ置かない)。
- **他リポへの波及まとめ**:
  - Ostiarius: 原則変更なし (必要になれば warning 抑止オプションのみ)
  - Cocoiru: Phase 2 で agent の送信先設定化 (フォーク先は着手時に neco へ確認)
  - Cernere: Phase 5 の project 定義 migration のみ
  - Ludellus: 変更なし (native 資産の流用元。前提条件の消化は Ludellus 側の既存残タスク)
- **完成の定義 (v0.2)**: Phase 0〜4 完了 = neco 指示の要件 1/2/3/5/5-1/6 が本運用可能。
  要件 4 は仕様確定 + Phase 5 ゲート管理下、とする。
