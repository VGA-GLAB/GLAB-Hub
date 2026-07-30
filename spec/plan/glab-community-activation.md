# GLab コミュニティ活性化 統合設計 (v0.3 系)

Status: approved (2026-07-30 neco 裁定、§6 参照。実装は Codex 委託)
Date: 2026-07-30
発案: neco / 起草: Claude (4リポ並行調査に基づく)

---

## 0. 目的と全体像

GLab を「学生がゲームを作り・遊び・語る場」として活性化する。4 要件を
既存サービスの責務分担 (単一情報源原則) を崩さずに実現する。

| # | 要件 | 正本データ | UI | 補助サービス |
|---|---|---|---|---|
| 1 | 遊んだゲームの感想投稿 (お勧め/しない付き) | Volputas (voices 拡張) | GLAB volputas プラグイン + Volputas SPA | Nuntius (Discord リレー) |
| 2 | GLab ゲームリスト (ビルド配布/更新/リモートプレイ/感想) | GLAB `glab_project` 拡張 + GitHub | GLAB projects プラグイン拡張 | GitHub Actions (ビルド), Custos (リモートプレイ), Volputas (感想) |
| 3 | インスタント相談チャンネル + おれひまフラグ | GLAB (チャンネル台帳) + Cernere (フラグ) | GLAB 新 consult プラグイン + Discord | GLab bot (フォーラムスレッド), Nuntius (メンション) |
| 4 | テクニカル情報共有 (Memoria-Share) | GLAB 新 `glab_tech_link` | GLAB 新 tech-links プラグイン | Memoria (outbound アダプタ) |

### 全体データフロー

```
[学生] ─ GLAB Web (5187, Corpus hub)
   │        ├ volputas proxy ──────────→ Volputas (8892) ──→ Cernere (回答/感想 正本)
   │        ├ projects (ゲームリスト正本)──→ GitHub API (repo/actions/releases)
   │        │                         └──→ Custos (7676) リモートプレイ
   │        ├ consult ──→ GLab bot ──→ Discord フォーラムスレッド
   │        └ tech-links (正本) ←── Memoria (5180) outbound アダプタ
   │
   └ Discord ←─ Nuntius (感想リレー/おれひまメンション) ←─ Volputas/GLAB
```

### 設計原則 (既存規約の継承)

- **単一情報源**: 個人属性は Cernere、感想は Volputas/Cernere、ゲームリストは GLAB
  `glab_project`。他サービス正本の複製禁止 (`DESIGN.md §3-4`)。
- GLAB の proxy 応答は `cache-control: private, no-store` 必須 (`plugins/shared.ts:15`, PR#17)。
- API 入力は zod `.strict()`、downstream 応答は手書き厳格 parser (`plugins/volputas/contracts.ts` 方式)。
- 接続先未設定は degraded (503 + パネル「未接続」)、設定値不正は起動失敗。silent fallback 禁止。
- 外部サービス受け口は `/api/x/<id>/external/...` + service token
  (`plugins/projects/service-auth.ts` の `requireServiceToken` 再利用)。
- 全パネルは `requireVantanUserRegistration` ゲートを通す。

---

## 1. 要件1: ゲーム感想投稿 + Discord リレー

### 1.1 感想データの正本 — Volputas voices 拡張 (B案採用)

既存 3 系統 (impression / voices / survey) のうち **voices をコアに採用**する。

| 案 | 判定 | 理由 |
|---|---|---|
| A. impression 拡張 | 後続 (スクショ/動画添付が要るとき) | ダミー session 4 コール構成が歪。rating が `client_metadata` JSONB 埋没 |
| **B. voices 拡張** | **採用** | `polarity: 'like'/'dislike'` が「お勧め/お勧めしない」と 1:1。ローカル/Cernere 両モード対応。ペルソナ v2 evidence に自動流入 |
| C. survey 回答 | 不採用 | survey×user UNIQUE = 1 ゲーム 1 件制約が「何度でも投稿」と非適合 |

拡張内容 (Volputas `player-profile-server`):

- `validateVoiceInput` (`src/services/profileEvidenceSchemas.js:103`) に追加:
  - `recommend: boolean` — polarity から導出可能だが明示フィールドとして持つ (UI の「お勧め/しない」トグルと 1:1)
  - `glabProjectId: string | null` — GLab ゲームリストへの**不透明参照** (要件2 連携。Actio `tasks.project_id` と同じ扱い、表示名解決は GLAB 側)
  - `visibility: 'private' | 'community'` — 公開フィード掲載の明示 opt-in (既定 private)
- 公開フィード read API 新設: `GET /api/v1/integrations/glab/reviews?projectId=&limit=&offset=`
  — `src/routes/glabSurveys.js` と対称の `createCernereProjectAuth()` 配下に
  `src/routes/glabReviews.js` + `src/services/glabReviewService.js`。
  `visibility='community'` のみ返す。投稿者名は Cernere displayName 解決 or `pseudoId` 匿名化
  (既定は表示名あり、本人が匿名を選べる)。
- 「最近遊んだゲーム」候補提示: `steam_owned_games.playtime_2weeks_minutes` (`007_steam_integration.sql`)
  から入力フォームに候補チップを出す。手入力も可。
- 既存の不一致修正を同梱: `gameReview.js:63` の `volputas_web_game_review` と
  `mediaPolicy.js:105` の `volputas_web_review` の文字列不一致を解消。

### 1.2 Discord リレー — Nuntius topics 経由

- 経路: Volputas 投稿完了 (visibility=community のみ) → **Nuntius `POST /api/topics/game-impressions/publish`**。
  Concordia はセッション結合が重いため使わない。webhook URL 直持ちもしない
  (Nuntius が credential を管理、`@everyone` 無効化・2000字切り詰めも既存)。
- best-effort: リレー失敗で投稿本体のトランザクションを壊さない (GLab bot `postToChannel` と同方針)。
- 二重送信防止: 感想レコードに `relayed_at` を持ち、送信成功時のみ更新
  (GLab bot scheduler の `notified_at` パターン)。
- 投稿フォーマット: ゲーム名 / お勧め・しない / 本文抜粋 / GLAB の該当ゲームページ URL。
  Nuntius templates (`{{var}}`) で整形。
- 投稿先チャンネル: **GLab 専用チャンネル** (neco 裁定)。Discutere の「ゲーム感想」
  カテゴリとは共用しない — Di は Di で収集チャンネルを用意するか、この専用チャンネルに
  Di 側が相乗りする (Di 側の判断、この設計のスコープ外)。チャンネル ID は
  GLab bot の暗号化 config (`bot/config.ts` の `channels` に `review` を追加) で持つ。

### 1.3 GLAB 側 UI

- `plugins/volputas/index.ts` の proxy に読み取り `GET /reviews` と投稿 `POST /reviews` を追加
  (既存 `proxy()` + tokenProvider にそのまま乗る。投稿は voices 追記 API へ中継)。
- `plugins/volputas/panel.ts` に「感想フィード」タブ追加 + 投稿フォーム
  (送信は上記 `POST /reviews` へ)。`contracts.ts` に `parseReviewList` 厳格 parser 追加。
- 新プラグイン (`consult` / `tech-links`) は `plugins/pack.json` の `modules` と
  `package.json` の `build:panels` への追加まで含めて 1 PR とする (CLAUDE.md のモジュール追加手順)。

---

## 2. 要件2: GLab ゲームリスト

**母体は既存 `projects` プラグイン** (`glab_project` = 学生ゲーム PJ レジストリ正本、
producer/member・repo_url・Omnipotens 解析表示まで実装済み)。これを「ゲームリスト」へ拡張する。

### 2.1 GitHub 連携 (新規 — 現状 GLAB に GitHub API クライアントは皆無)

- GLAB に `plugins/projects/github-client.ts` を新設。**取得するのは Open (public) な情報のみ**
  (neco 裁定): public repo の description / README / topics / contributors / Releases。
  private repo は対象外 (ゲームリスト掲載 = public 化が前提)。
- 認証は **PC に登録済みの PAT** (dw の暗号化 PAT 運用と同系)。用途は rate limit 緩和のみで、
  権限は public read で足りる。Excubitor env 注入、固定保存禁止規約に従う。
  PAT 未設定でも動く (未認証 60req/h に縮退 + キャッシュ延長) 設計とする。
- `glab_project.repo_url` から owner/repo を解決し、以下を**キャッシュ付きで自動取得**:
  - 概要: repo description / README 先頭 / topics → `glab_project.description` の自動補完
    (手動編集値を上書きしない。`auto_synced_at` と手動編集フラグで区別)
  - チームメンバー: contributors API → `glab_project_member` への**候補提示**
    (自動確定はしない — GitHub アカウント⇔Cernere ユーザの突合が未確立のため、
    producer が候補から承認する UI とする)
- 同期は on-demand (詳細画面表示時、TTL キャッシュ) + 手動「再同期」ボタン。cron は持たない。

### 2.2 自動ビルドとダウンロード配布

**ビルド実行は GitHub Actions に寄せ、GLAB はビルドしない** (GLAB ホストに Unity/ビルド環境を
持ち込まない。既にあるビルド基盤を使う)。

- LUDIARS 側に **workflow テンプレート** (`unity-build.yml` 等) を用意し、各ゲームリポに配置。
  push (tag) → Actions ビルド → **GitHub Release に成果物添付** を標準経路とする。
- GLAB は Releases API を読み、ゲーム詳細に「ダウンロード」ボタンを出す。配布方式は 2 段:
  1. **Phase 1: Release asset への直リンク** (public repo 前提のためこれで完結) —
     GLAB は URL を出すだけ。追加実装最小。
  2. **Phase 2 (任意): GLAB proxy 配布** (ダウンロード数計測が欲しくなったら) —
     asset をストリーミング転送。`analysis-report-store.ts` のガード
     (realpath/サイズ上限/CSP) を踏襲しつつ、**大容量バイナリ用にストリーミング実装が必要**
     (現状は readFile 全読み・HTML 20MB 上限)。
     取得先は `glab_project_release` にキャッシュした URL をそのまま fetch せず、
     `repo + release id + asset id` から GitHub API ホスト固定で組み立てる
     (キャッシュ汚染経由の SSRF を構造的に潰す)。
- 新テーブル `glab_project_release` (`plugins/data.ts`):
  `project_id / tag / name / published_at / assets JSON / synced_at`。
  正本は GitHub、これは表示キャッシュ (単一情報源原則と整合)。
- **アップデート**: 新 Release が出たら一覧・詳細に「更新あり」バッジ。
  bot 通知 (`bot/notify/scheduler.ts` の `notified_at` パターンで #event へ「vX.Y 公開」)。

### 2.3 リモートプレイ (Custos 連携)

Custos は capture (WebRTC/screenshot) / input (bridge/nut-js) / exe 実行 (build→run→capture→input
の実績あり) が揃っているが、公開機能には 5 つの壁がある:
**単一ホスト・認証がザル (`CUSTOS_OPEN=1`/anonymous 既定)・1視聴者=1ffmpeg・TURN 無し・
Unity bridge は製品ビルドから除外**。

これを踏まえ **「共用試遊台 (占有制)」モデル**で段階導入する:

- Phase 1 (MVP): Custos ホスト 1 台に対し **同時プレイ 1 セッション占有制**。
  - GLAB 側に `plugins/projects/remote-play.ts` — 「プレイする」→ 占有 claim
    (先客がいれば待ち表示) → Custos `/api/apps/:id` run + WebRTC offer を **GLAB 経由 proxy**。
  - 占有の解放条件を claim と同時に決める (タブを閉じただけで台が永久占有されないよう):
    明示「終了」 / heartbeat 途絶 (数十秒) / 最大占有時間 (例 15 分) の 3 つで release し、
    release 時に Custos 側プロセスも停止させる。
  - **Custos には GLAB からのみ到達させる** (service token + loopback/LAN 限定)。
    Custos 自体の Cernere 認証 (Phase 2 未着手) を待たず、GLAB の requireAuth を認可境界にする。
  - 入力は inAppBridge (ergo/unity 17778) 優先。nut-js 経路 (OS 全体に入力が届く) は
    コミュニティ公開では**無効化**する。
  - ゲーム登録: `apps.json` は起動時ロードのみなので、リモートプレイ対象は
    運用者が `apps.json` に登録したタイトルに限定 (動的登録は Custos 側改修が要るため後続)。
- Phase 2 以降: 観戦モード (1 encode → N peer の fan-out 改修)、TURN 導入、動的登録。
- 対象は **Windows Standalone exe のみ**。WebGL は Custos の抽象に乗らないため、
  WebGL ビルドは「ブラウザで直接遊ぶ」リンク (Release asset の静的ホスティング) として
  別枠で扱う (リモートプレイ不要でむしろ体験が良い)。

### 2.4 感想の紐付け (要件1 との接続)

- ゲーム詳細ページに Volputas 感想フィード (`GET /reviews?projectId=`) を表示
  (`plugins/projects/panel.ts` に感想セクション)。
- 投稿導線: 詳細ページから「感想を書く」→ volputas パネルの投稿フォームへ
  `glabProjectId` プリセット付きで遷移。

---

## 3. 要件3: インスタント相談チャンネル + おれひま

### 3.1 チャンネル作成と Discord 同期

- **実装先は GLab bot** (`bot/`)。既に discord.js Gateway 常駐 + 暗号化 config + scheduler を持ち、
  追加コスト最小。Concordia の Discord 資産はセッション/デリゲーションに強結合で、
  外部から叩く汎用 API が無いため使わない (パターンだけ移植)。
- **1 相談 = Discord フォーラムの 1 スレッド**。Cc#326 の結論
  (channel 15 webhook 上限 / category 50 上限 / rename 制限の回避) をそのまま踏襲:
  親フォーラム「相談」を起動時 ensure (Concordia `config.ts` の ensureForum パターン移植) +
  フォーラム単位 webhook 1 本。
- GLAB 新プラグイン `consult`:
  - `POST /api/x.../consults {title, body, tags}` → SQLite `glab_consult`
    (id/thread_id/title/status(open|resolved)/created_by/created_at) に台帳記録 →
    bot がスレッド作成 + 初回投稿。
  - パネル: 相談一覧 (open/resolved) + 新規作成フォーム + 各相談の Discord リンク。
  - 解決したら「解決済み」→ スレッドにタグ付与 + archive。
- **Discord 投稿時のメンション制御**: 相談の title/body はユーザ入力なので、bot の投稿は
  `allowedMentions` で `@everyone`/`@here`/ロールメンションを無効化し、招集で組み立てた
  個人メンション (users allowlist) のみ許可する。現状の `bot/channels.ts` の `postToChannel`
  は `allowedMentions` を指定していないため、この経路を足す際に併せて明示指定を入れる。
- 乱用防止: 1 ユーザあたりの相談作成レートを制限し (例 短時間の連続作成を拒否)、
  1 相談で組み立てる個人メンション数にも上限を設ける (超過分は表示名の列挙に落とす)。
- **同期範囲は Phase 1 では片方向** (GLab → Discord 作成/状態変更 + Discord への深いリンク)。
  本文の双方向ミラーは MessageContent intent 追加 (現状 bot は `Guilds` のみ) と
  ingress 実装 (Concordia `ingress.ts` 参照) が要るため Phase 2。
  会話自体は Discord 上で行う想定なので Phase 1 で用は足りる。

### 3.2 おれひまフラグ

- **正本 = Cernere `project_data_glab`** に `available_now BOOLEAN` + `available_until TIMESTAMPTZ`
  を追加。schema_definition の 1 追記で済む (`schema-migrator.ts` が冪等 ADD COLUMN)。
  GLAB SQLite (`glab_user.attendance_status` 方式) でなく Cernere に置く理由:
  他サービス (Volputas/Discutere 等) からの将来参照と、個人状態を GLab に複製しない方針の一貫性。
- 時限式: `available_until` 経過後は自動的に非ひま扱い (読み出し時に判定、バッチ不要)。
- 設定 UI: GLAB ヘッダに「おれひま」トグル (今から N 時間ひま)。
- **相談作成時の招集フロー**:
  1. GLAB が Cernere から `available_now` かつ期限内のユーザ一覧を取得
  2. Discord メンションに解決して相談スレッドの初回投稿に含める → 通知が飛ぶ
  3. メンション解決は Nuntius `discord-mentions.ts` (`<@id>` 解決) を利用
- **Cernere ユーザ ⇔ Discord ユーザの連携を最初から実装する** (neco 裁定 —
  ロール方式 MVP は採らず、突合込みのフルセットで作る):
  - **Cernere に `discord_id` 列 + Discord OAuth link を追加** (`google_id` の前例
    `002_google_auth_and_password.sql` パターン)。Volputas の Discord OAuth identity source
    (`src/config/index.js:132`) が org 内唯一の既存経路なので endpoint/設定の作りを流用。
    link/unlink UI は Cernere のアカウント設定画面に置く (google link と同列)。
  - GLAB は Cernere から「available_now かつ期限内」のユーザの `discord_id` を取得して
    `<@id>` メンションを組み立てる (個人メンション)。未 link のひまユーザは
    メンション不可なので、表示名の列挙 (メンションなし) で招集文面に含める。
  - bot の `/orehima on|off [hours]` slash command も提供: bot は実行者の Discord user id
    から Cernere `discord_id` 逆引きで user を特定し、GLAB external API 経由で
    Cernere `available_now`/`available_until` を更新する (未 link なら link 手順を案内)。
    これで GLAB Web と Discord のどちらから切り替えても**正本は Cernere の 1 系統**。

---

## 4. 要件4: テクニカル情報共有 (Memoria-Share)

### 4.1 データ正本 — GLAB 新 `glab_tech_link`

共有された技術リンクは**コミュニティ資産**であり、GLAB を正本とする (`glab_job` と同格)。
Memoria の個人ブックマークの複製ではなく「共有ポスト」として独立させる
(Memoria 側の「共有 retraction が無い」既知欠陥を、削除同期を最初から入れて回避する)。

`plugins/data.ts` 追加:

```
glab_tech_link:
  id / url / title / summary / memo(解説) / posted_by(user_id) /
  source TEXT ('web' | 'memoria') / source_ref TEXT NULL (Memoria 側 bookmark id) /
  created_at / updated_at / deleted_at
glab_tech_link_tag: (link_id, tag)
glab_tech_link_comment: id / link_id / user_id / body / created_at   -- 解説/補足スレッド
```

- **共有されるのはメタデータのみ** (url/title/summary/memo/categories)。
  Memoria の HTML スナップショットは絶対に外に出さない (Memoria 規約)。
- GLAB 新プラグイン `tech-links`: 一覧 (タグ絞り込み/検索) + 投稿フォーム + コメント。
  OG プレビューは URL から GLAB 側で on-demand 取得 (Memoria `page_metadata` は借りない)。
- **OG 取得の SSRF ガード** (URL がユーザ入力であるため必須): スキームは `http`/`https` のみ、
  名前解決後のアドレスが loopback/private/link-local なら拒否、リダイレクトは追随上限つき
  かつ追随先も同じ検査にかける、レスポンスは size / timeout 上限で打ち切る。
  表示側は `javascript:` 等のスキームを弾き、外部リンクは `rel="noopener noreferrer"` を付ける。

### 4.2 Memoria からの投稿 (Memoria 側改修)

- `server/glab/` を新設し、**discord/ と同じ「loopback HTTP で自分の API を叩く +
  mv で切り出せる」境界規約**で実装 (God file `db.ts` に足さない)。
- UI: ブックマーク詳細/一覧に「GLab に共有」ボタン → 明示 opt-in で
  GLAB `/api/x/tech-links/external/links` (service token) へ POST。
  成功したら Memoria 側に `shared_at`/`shared_origin` を記録 (既存の行レベル共有印を流用)。
- **削除同期**: Memoria 側で共有解除/削除 → GLAB external API に DELETE。
  照合は `source='memoria'` かつ `source_ref` 一致 **かつ `posted_by` = 呼び出しユーザ** の
  3 条件 (source_ref は Memoria ローカルの bookmark id で衝突・推測がありうるため、
  service token だけで他人の投稿を消せる状態にしない)。GLAB 側は `deleted_at` 論理削除。
- ユーザ突合: Memoria はローカルで Cernere を知らないため、**Memoria の Hub (multi) モード経由
  のみ共有可**とする (Hub が Cernere 代理ログイン済みで user id を持つ)。
  `posted_by` はリクエストボディで受け取らず、**転送されたユーザトークンから GLAB 側で導出**する
  (service token は経路認証のみ。任意 `posted_by` を受けると成りすまし投稿・削除が可能になる)。
  ローカル単独モードからの共有は Phase 2 で検討。

---

## 5. フェーズ分割

| Phase | 内容 | 主リポ |
|---|---|---|
| **P1** | 感想投稿コア: voices 拡張 (recommend/glabProjectId/visibility) + 公開フィード API + GLAB 感想タブ | Volputas, GLAB |
| **P2** | Discord リレー: Nuntius topic + relayed_at + GLab 専用チャンネル + 投稿フォーマット | Volputas, Nuntius |
| **P3** | ゲームリスト基盤: GitHub client (public API + PAT) + 概要/メンバー自動取得 + Release 表示/直リンク配布 + 更新バッジ | GLAB |
| **P4a** | Discord 連携基盤: Cernere `discord_id` + OAuth link + link/unlink UI | Cernere |
| **P4b** | 相談チャンネル + v0.2 全実装: consult プラグイン + bot フォーラムスレッド + おれひま (Cernere 連携 + `/orehima`) + **v0.2 forum/roles/presence** (`glab-hub-v0.2-implementation.md` Phase 0-4。Phase 5 顔認証は着手ゲート下で対象外) | GLAB |
| **P5** | テクニカル共有: tech-links プラグイン + Memoria outbound アダプタ + 削除同期 | GLAB, Memoria |
| **P6** | リモートプレイ (後回し、neco 裁定): 占有制 + GLAB proxy + inAppBridge 入力 | GLAB, Custos |
| **P7** | 深化: proxy 配布 (DL 計測) / 相談チャンネル双方向同期 / 観戦 fan-out / TURN | GLAB ほか |

P1-P2 (要件1) が最小の見せ場で独立性も高いため先行。P3 は P1 と並行可。
P4a は P4b の前提 (おれひまの個人メンションが discord_id に依存)。
consult は v0.2 forum と**別物として設計**するが、**実装開始は v0.2 全実装と同時**
(neco 裁定) — P4b にまとめる。
各 Phase = 1 PR 集約 (リポをまたぐ場合はリポごとに 1 PR)。

---

## 6. 裁定済み事項 (2026-07-30 neco)

1. **GitHub 連携**: Open (public) な情報のみ取得。認証は PC 登録済みの PAT。GitHub App は使わない。
2. **感想の匿名性**: 表示名既定 + 投稿ごとに匿名選択可。
3. **Discord リレー先**: GLab 専用チャンネル。Di は Di で用意するか専用チャンネルに相乗り (Di 側判断)。
4. **おれひま**: ロール方式 MVP は採らず、Cernere⇔Discord 連携 (discord_id + OAuth link) を最初から実装。
5. **リモートプレイ**: 後回し (P6 のまま)。
6. **v0.2 forum との関係**: consult は別物として設計し、実装は v0.2 全実装と併せて開始 (P4b)。

---

## 7. 実装委託計画 (Codex 委託、モデル選定は Fable)

実装は Concordia delegation template 経由で Codex に委託する。委託単位 = §5 の Phase
(リポをまたぐものはリポごとに分割)。全タスク共通の委託条件:

- full-set 実装 (MVP 縮小禁止)。spec の該当節 + 対象リポの CLAUDE.md 規約を prompt に添付。
- prettier/fmt 適用必須 (1 行圧縮コード禁止)。
- 中核ロジックの受け入れテストは委託前に Claude 側で作成し、pass を完了条件にする
  (grep 自己検証は不可)。
- 納品はローカル PR (Revisor) 1 本/リポ。

| 委託タスク | リポ | モデル | 根拠 |
|---|---|---|---|
| P1-a voices 拡張 + 公開フィード API | Volputas | gpt-5.6-sol | 既存レール (collectionRoutes/glabSurveys 対称) に乗る定型実装 |
| P1-b 感想タブ + contracts | GLAB | gpt-5.6-sol | panel-kit/contracts の既存パターン踏襲 |
| P2 Nuntius リレー + relayed_at | Volputas, Nuntius | gpt-5.6-sol | 送信 1 経路 + フラグ 1 列の小規模 |
| P3 GitHub client + Releases 表示 | GLAB | gpt-5.6-sol | public API read + キャッシュの定型 |
| P4a discord_id + OAuth link | Cernere | **gpt-5.6-ultra** | 認証コア改修。セキュリティ影響大、既存 OAuth 経路との整合が必要 |
| P4b consult + v0.2 forum/roles/presence + bot | GLAB | **gpt-5.6-ultra** | 最大規模。DB 設計 + bot + 可視性制御の横断整合 |
| P5 tech-links + Memoria アダプタ | GLAB, Memoria | gpt-5.6-sol | 境界規約 (loopback/service token) を spec で固定済み |

P6 (リモートプレイ) は裁定どおり保留、着手時に別途計画。
