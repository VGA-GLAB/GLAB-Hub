# GLab-Hub v0.2 仕様書 — 出席・自動ログイン・役職別情報共有

> 分類: plan (統合仕様)。2026-07-10 neco 指示の 6 要件 + 追加 2 指示を v0.1 実装
> (Corpus 派生 hub + Discord Bot) の上に統合する。個別詳細は spec/feature/・spec/data/ の
> 各ファイルへ分割し、本書は全体像と設計判断の正本とする。

## 1. 要件 (2026-07-10 neco 指示)

1. ユーザは **Cernere** でログインする
2. **PC 常駐のサービス/アプリ**を入れて自動ログイン (**COCOIRU**)
3. **Ostiarius** で出席を管理する
4. **Ludellus / Ludellus-Server の動体・顔認証仕様**をコピーして GLab 用に適合・レビューする
5. **役職ごとに情報共有**が行える土壌を作る (5-1. 情報投稿用フォーラムを用意する)
6. **イベントスケジュール**を共有する

追加指示:

- **Ostiarius は小さい実装なので GLAB リポの submodule として内包**する
- **GLab と Cernere を起動するだけで出席確認ができる状態**にする (= 出席の基本経路は
  Aedilis / Actio / その他サービスの稼働に依存しない)

## 2. 全体アーキテクチャ (v0.1 → v0.2)

```
                        Cernere (認証・役職属性・顔テンプレの単一情報源)
                            │
        ┌───────────────────┼──────────────────────────┐
        ▼                   ▼                          ▼
   Web hub (Corpus)     Ostiarius (submodule)      PC 常駐エージェント
   plugins/             ostiarius/                 (COCOIRU desktop-agent 流用)
    attendance(自前化)   passkey チェックイン         refresh token 自動ログイン
    presence(新規)  ◀──  attestation 発行            WiFi 在席検知 heartbeat ──┐
    forum(新規)          モバイルフォールバック                                │
    events(拡張)                                                             │
    facility(現状維持)   [Phase 5] glab-face-agent                            │
    jobs(現状維持)        顔認証・動体検知 ────────────────────────────────────┤
        │                                                                    │
        ├── data/corpus.db (WAL 共有) ── Discord Bot (bot/)                   │
        │     glab_event / glab_job                                          │
        │     glab_attendance / glab_member_role (新規)                       │
        │     glab_forum_thread / glab_forum_comment (新規)                   │
        │     glab_floor_map (新規)                                           │
        └────────────── POST /api/x/presence/heartbeat 等で受信 ◀─────────────┘
```

v0.1 からの変更点:

| 項目 | v0.1 | v0.2 |
|---|---|---|
| 出席の正本 | Aedilis (GLAB は閲覧 proxy) | **GLab-Hub 自前 `glab_attendance`** |
| Ostiarius | 外部スタンドアロン (Aedilis 向け) | **GLAB submodule `ostiarius/` として内包・同時起動** |
| attestation 検証 | Aedilis `/api/checkin/verify` | **GLab-Hub が Ed25519 検証** (gateway 公開鍵は GLab-Hub が保持) |
| 出席経路 | passkey → Aedilis のみ | passkey / モバイル / **COCOIRU 自動** / (Phase 5) 顔認証 の 4 経路が全て `glab_attendance` に合流 |
| 役職 | なし (admin 二値のみ) | **`glab_member_role`** (GLab 運用データとして自前管理) |
| フォーラム | なし | **forum プラグイン** (役職別 audience) |
| イベント | 登録/一覧/Discord 通知 | + **audience_roles・週間スケジュールビュー** |
| facility / jobs | Aedilis proxy / 自前 | 現状維持 (本仕様のスコープ外) |

### 起動モデル (追加指示への回答)

`npm run dev` (または `npm start`) が **Web hub (Corpus, :5187) と Ostiarius (:17590) を
同時起動**する (concurrently)。依存サービスは **Cernere のみ**。これで:

- ブラウザ → Cernere ログイン → hub 閲覧 (要件 1)
- 会場 LAN 内の端末 → Ostiarius passkey チェックイン → attestation → GLab-Hub が検証・記録 (要件 3)

が成立する。Discord Bot・COCOIRU 自動出席・顔認証は「起動していれば上乗せされる」
オプショナル経路であり、基本の出席確認を阻害しない (degraded 設計は v0.1 を踏襲)。

## 3. 要件別仕様

### 3-1. Cernere ログイン (要件 1) — 既存踏襲 + 役職参照の追加

- v0.1 の Corpus 認証をそのまま使う: Bearer / cookie `cernere_token` → Cernere
  `GET /api/auth/me` 検証 (5 分キャッシュ)。admin は `CORPUS_ADMIN_IDS`。
- 追加: プラグインは `getIdentity(c)` の userId をキーに **`glab_member_role` を引いて
  役職を解決**する (Cernere の `role` は admin/general の二値でありラボ役職には使わない。
  §3-5 参照)。
- 学生属性 (学部・学年等) が必要な画面は Cernere `vantan_user` プロジェクトの data_sharing
  read-only 取得 (Ostiarius `vantan-user-client.ts` と同方式) で都度解決し、保管しない。

### 3-2. PC 常駐サービスによる自動ログイン (要件 2) — COCOIRU desktop-agent の GLab 直結

**COCOIRU の desktop-agent を GLab の公式常駐クライアントとして採用**し、送信先を
GLab-Hub に直結する (設計判断は §5-B)。

- **自動ログイン**: agent 既存の `ensureCernereSession` を流用 —
  初回のみ対話 setup で Cernere email/password ログイン → 以後は**ローテーション式
  refresh token (30 日) の永続化**で無人ログイン維持。401 検知で自動再ログイン。
  - 改善 (GLab 要件): refresh token は平文 JSON ではなく **DPAPI (Windows) で暗号化保存**。
    初回 setup は `agent setup` コマンドの対話式とし、平文 password をファイルに残さない。
  - Cernere に device flow (RFC 8628) は無く、device-trust は撤去済みのため、
    「本人の refresh token を単一プロセスが保持する」方式が現実解。agent の多重起動は
    reuse 検出で全セッション失効するため、二重起動ガードを入れる。
- **在席検知**: agent 既存の WiFi スキャン (`netsh`) を流用。学内 SSID/BSSID を
  `glab_floor_map` と突合して在校 confidence を算出 (COCOIRU `presence-resolver.ts` /
  `wifi-resolver.ts` を GLab-Hub の presence プラグインに移植)。
- **自動出席**: `confidence >= 50` で agent が `POST /api/x/presence/auto-checkin` →
  `glab_attendance` に `source = "cocoiru"` で記録。冪等性はサーバ側 UNIQUE
  (user_id + 出席日) で担保 (agent 再起動による二重打刻をサーバで吸収)。
- **常駐化 (新規)**: Windows タスクスケジューラ登録 (`agent install` コマンド) による
  ログオン時自動起動 + 失敗時再起動。トレイ UI は本フェーズではスコープ外 (CLI 常駐)。
- GLab-Hub 側受け口: 新 **presence プラグイン** — `POST /heartbeat` (WiFi 状態受信 +
  confidence 返却)、`POST /auto-checkin`、`GET /connected`(在席中メンバー一覧)、
  floor map 管理 (admin)。
- 互換受け口: `POST /api/attendance/auto-checkin` (COCOIRU server module の
  `glab-hub-bridge.ts` が叩く既存契約) も受ける — Actio 側 COCOIRU を併用する構成でも動く。

### 3-3. Ostiarius による出席管理 (要件 3 + submodule 内包)

- **取り込み**: `git submodule add https://github.com/LUDIARS/Ostiarius ostiarius/`。
  corpus/ と同じ「触らない」規約 — 変更は LUDIARS/Ostiarius 側 PR で行い pointer 更新。
- **起動**: ルート `package.json` に `dev:gateway` を追加し、`npm run dev` が hub と
  concurrently で起動。設定 (lanId / facilityId / 鍵) は GLAB ルートの env から注入。
- **チェックインフロー (v0.2)**:
  1. 会場 LAN 内の端末が Ostiarius `POST /checkin/begin` → `finish` (passkey オフライン検証)
  2. Ostiarius が Ed25519 presence-attestation を返す (既存実装のまま)
  3. 端末 (hub フロントの attendance パネル) が attestation を GLab-Hub
     `POST /api/x/attendance/checkin` へ提出
  4. GLab-Hub が **登録済み gateway 公開鍵で署名検証** (Aedilis `gateway_registry` の
     最小版を attendance プラグイン内に実装: `glab_gateway` テーブル or env 固定 1 件) →
     nonce 一意・issuedAt 鮮度を確認 → `glab_attendance` に `source = "passkey"` で記録
- **モバイルフォールバック**: Ostiarius 既存の mobile-checkin (Cernere email/password →
  attestation) をそのまま有効化。`source = "mobile"`。
- **会場境界**: Ostiarius を会場 LAN にのみ listen させる運用前提 (到達性 = 在場性) を踏襲。
  GLab-Hub 自体は WAN 公開可 (attestation 署名が在場の証明)。
- passkey 公開鍵の Cernere 同期 (credential cache) は Ostiarius 既存実装のまま。
- **attendance プラグインの置換**: v0.1 の Aedilis proxy を廃止し、自前 `glab_attendance` の
  閲覧 (自分の履歴 / admin 全員一覧 / 日別集計) に差し替える。

### 3-4. 動体・顔認証 (要件 4) — 適合・レビュー完了、Phase 5 で実装

- 原本コピー: [spec/imported/ludellus-player-tracking.md](../imported/ludellus-player-tracking.md) /
  [spec/imported/ludellus-face-identity.md](../imported/ludellus-face-identity.md)
- 適合版 + レビュー: **[spec/feature/face-attendance.md](../feature/face-attendance.md)**
- 要点: 照合コア・FSM・プライバシー原則は流用可。roster の名簿常駐化・閾値強化・
  出席目的の同意フロー・出席ログ永続化の 4 点が新規設計。OpenCV 実映像 / Cernere 実疎通が
  Ludellus 側で未検証のため、**passkey + COCOIRU 安定後の Phase 5 (シャドー運用から)** とする。

### 3-5. 役職別情報共有 (要件 5) + フォーラム (5-1)

**役職モデル (新規)**:

- `glab_member_role` テーブル: `user_id`(Cernere FK) × `role` (複数可)。
  役職は GLab の**運用データ** (肩書き・担当) であり個人属性ではないため GLab 自前 DB に置く
  (個人データ保管禁止と整合。表示名は都度 Cernere lookup)。
- 役職語彙は固定 enum にせず `glab_role_def` (role キー + 表示名 + 並び順) で admin が管理
  (例: `lead` 運営 / `planner` プランナー / `programmer` プログラマー / `designer` デザイナー /
  `student` 一般メンバー)。
- 付与/剥奪は admin (CORPUS_ADMIN_IDS) のみ。管理 UI は attendance と同じ hub パネル。
- Discord Bot との突合は将来課題 (v0.1 DESIGN §7 のオープン論点を踏襲)。Bot 経由の投稿は
  役職なし (全員向け) 扱いから始める。

**forum プラグイン (新規)**:

- 2 層構造: `glab_forum_thread` (スレッド) + `glab_forum_comment` (返信)。
- **audience_roles**: スレッドに対象役職 (複数、空 = 全員) を付与。一覧/閲覧は
  「自分の役職と交差する or 空 or 自分が投稿者 or admin」のみ返す
  (サーバ側フィルタ。UI 非表示だけに頼らない)。
- 投稿は認証メンバー全員可。編集/削除は投稿者 or admin。admin はピン留め可。
- パネル UI は jobs パネル (投稿フォーム + フィルタ + 一覧) を雛形に、役職タブ +
  スレッド詳細 + コメント欄を追加。
- Discord 連携 (任意): 新着スレッドを `#forum` チャンネルに通知 (notified_at 方式踏襲)。
  役職限定スレッドは Discord には流さない (Bot 側で役職判定できないため)。

### 3-6. イベントスケジュール共有 (要件 6) — events 拡張

v0.1 の events (登録/一覧/削除 + Discord `/event` + リマインダ) を拡張:

- `glab_event` に `ends_at` / `audience_roles` / `recurrence` (none|weekly) を追加。
- hub パネルに**週間スケジュールビュー** (日別グルーピング) を追加。一覧は audience で
  フィルタ (forum と同じ可視性規則)。
- Discord リマインダは既存スケジューラを踏襲。役職限定イベントは Discord 通知対象外とする
  (Bot 側で役職判定できないため)。

## 4. データモデル追加分 (詳細は spec/data/)

| テーブル | 用途 | 主キー/一意制約 |
|---|---|---|
| `glab_attendance` | 出席記録 (全経路合流)。user_id, checked_in_at, date, source(passkey/mobile/cocoiru/face), facility_id, detail(json) | UNIQUE(user_id, date, facility_id) — 1 日 1 回冪等 |
| `glab_gateway` | Ostiarius gateway 公開鍵登録 (lan_id, facility_id, public_key_pem) | PK lan_id |
| `glab_floor_map` | SSID/BSSID → フロア/部屋 (COCOIRU floor_map 移植) | PK id |
| `glab_member_role` | user_id × role 付与 | UNIQUE(user_id, role) |
| `glab_role_def` | 役職語彙 (key, label, sort) | PK key |
| `glab_forum_thread` | スレッド (title, body, audience_roles json, pinned, created_by, notified_at) | PK id |
| `glab_forum_comment` | 返信 (thread_id FK, body, created_by) | PK id |
| `glab_event` 拡張 | + ends_at, audience_roles, recurrence | 既存 PK |

スキーマ正本は v0.1 同様 `plugins/data.ts` に集約 (`ensureSchema` 冪等 / Bot と WAL 共有)。

## 5. 設計判断 (4 軸: AI 学習量 / 作業コスト / 目的達成度 / 主目的との一致度)

### A. 出席の正本を Aedilis から GLab-Hub 自前に移す

| 案 | 学習量 | 作業コスト | 目的達成度 | 主目的一致 |
|---|---|---|---|---|
| A1: Aedilis 継続 (v0.1 のまま) | 低 | 低 | 中 (Aedilis 起動が必須) | ✗ GLab+Cernere だけで完結しない |
| **A2: GLab 自前 glab_attendance + attestation 検証内製 (採択)** | 中 (Ed25519 検証の内製) | 中 | 高 | ◎ 追加指示に直結 |

採択 A2。検証ロジックは Aedilis CONTRACTS §4 と同形 (署名 + nonce + 鮮度) で小さく、
Ostiarius `attestation.ts` に生成側の実装があるため対になる検証は少量で書ける。

### B. COCOIRU 自動出席の経路

| 案 | 学習量 | 作業コスト | 目的達成度 | 主目的一致 |
|---|---|---|---|---|
| B1: Actio 上の COCOIRU server 経由 (既存 glab-hub-bridge) | 低 | 最小 (受け口 1 本) | 中 | ✗ 自動出席に Actio 起動が必要 |
| **B2: desktop-agent を GLab-Hub 直結 + presence-resolver 移植 (採択)** | 中 | 中 (resolver/floor-map 移植 + agent の URL 切替) | 高 | ◎ GLab+Cernere で自動出席まで完結 |

採択 B2。ただし B1 互換の受け口 (`/api/attendance/auto-checkin`) も残し併用可能にする
(既存 COCOIRU 運用との両立 + 移行の保険)。agent 本体は Cocoiru リポの資産
(WiFi 読み取り・セッション維持) をほぼそのまま流用する。

### C. 役職の置き場所

| 案 | 学習量 | 作業コスト | 目的達成度 | 主目的一致 |
|---|---|---|---|---|
| C1: Cernere organization_members 拡張 | 高 (Cernere 側改修) | 高 | 高 | △ 汎用化しすぎ・他サービス波及 |
| C2: vantan_user プロジェクトデータに格納 | 中 | 中 | 中 (役職は学生属性でなく GLab 運用) | △ |
| **C3: GLab 自前 glab_member_role (採択)** | 低 | 低 | 高 (GLab 内で完結) | ◎ |

採択 C3。役職はラボ運営のデータであり Cernere 個人属性ではない、という境界整理。
将来 Cernere organization に昇格させる場合も glab_role_def の語彙をそのまま移せる。

## 6. スコープ外 (v0.2 でやらない)

- facility (施設予約) の Aedilis 依存解消 — 現状維持 (Aedilis 未稼働時は degraded 表示)。
- jobs / discord-chat の変更。
- 顔認証の本実装 (Phase 5 の仕様確定のみ。前提条件は face-attendance.md 参照)。
- Discord ユーザ ⇄ Cernere アカウント突合。
- トレイ UI・インストーラ (MSI) — agent は CLI + タスクスケジューラ登録まで。
- 出席の「退席/在席時間」集計 (checked_in の日次記録まで。presence ログは将来)。

## 7. セキュリティ・プライバシー総括

- 出席記録は user_id (FK) + 時刻 + source のみ。表示名・学部等は表示時に Cernere 解決
  (個人データ保管禁止の踏襲)。
- attestation は nonce 1-shot + issuedAt 鮮度で replay 防止 (Ostiarius 既存設計)。
- agent の資格情報: refresh token は DPAPI 暗号化、平文 password 非永続。
  サービストークン類は暗号化 config (`@ludiars/encrypted-config`) — Bot と同方式。
- 顔テンプレは Cernere 本人行のみ・埋め込みのみ・opt-in/即時撤回 (face-attendance.md)。
- 役職限定スレッドはサーバ側フィルタで強制 (クライアント非表示に依存しない)。
