# [imported] 機能: 跨セッション顔識別 (roster 限定 1:N)

> **出典**: `LUDIARS/Ludellus` `spec/feature/face-identity.md` (2026-07-10 時点 main) の原本コピー。
> GLab 用の適合版は [face-attendance](../feature/face-attendance.md) を参照。
> 本ファイルは参照用スナップショットであり、GLab 側では編集しない (更新は Ludellus 側が正本)。
>
> 補足: Ludellus-Server 側には動体検知・顔認証の仕様/実装は存在しない (2026-07-10 調査)。
> 検出・追跡・照合・Cernere 生体データ読み書きはすべて Ludellus クライアント (native C++ +
> renderer JS) 側に実装されている。

---

# 機能: 跨セッション顔識別 (roster 限定 1:N)

> 分類: feature。 [player-tracking](./ludellus-player-tracking.md) のセッション内 track に、
> **別日でも同じプレイヤー**を指す Cernere identity を束縛する。生体データのため
> Cernere 単一情報源・明示同意・roster 限定で扱う。

## 目的

- 跨セッションで「同じ人」を同じ Cernere user に再束縛したい (別日に来ても同一人物と分かる)。
- セッション内追跡 (PR #36) は track ID を保つだけで、誰かは分からない。ここで identity を付ける。

## 設計の核: なぜ「roster 限定 1:N」か

顔テンプレは**生体センシティブデータ**。全ユーザ相手の 1:N 識別は「全員分の生体DB」を作るか
Cernere にサーバ側 1:N 照合を新設するかになり、規模・法務が重い。

→ MR セッションは**参加者の Cernere ID が既知**(参加時に認証済)。照合相手を
**その部屋の数人 (roster)** に絞れば、全員分DBを作らずに済む。各テンプレは
**本人の Cernere 行**にのみ永続し、セッション中だけ roster gallery として一時注入される。

## データフロー

```
[登録 enroll]  ※一度きり・明示同意 / native (採択A) が担う
  プレイヤー Cernere ログイン → 顔を数 angle 撮影
   → FaceEmbedder(SFace) で L2 埋め込み計算 (その場限り, 生画像は保存しない)
   → cernere_face_service が managed_project.set_user_data で本人の biometric_face へ保存

[セッション]
  参加者の Cernere ID 既知 → cernere_face_service が各人の biometric_face を per-user 取得 → roster gallery
   → PersonDetectionSource(顔/体/外見) → PlayerTracker(track, PR#36)
   → 顔が取れた track について FaceEmbedder で probe → IdentityMatcher で roster 1:N
   → IdentityResolver が時間方向に投票 → 安定したら track.id ⇄ user_id を束縛
   → PlayerPosition.identity_user_id / identity_bound に載る
        ⇒ 顔ロスト中(coasting)も束縛は保持 / 別日でも同じ user に再束縛
```

## 照合アルゴリズム

- **IdentityMatcher (1:N)**: probe を roster 各人の最良テンプレとコサイン照合。
  受理条件 = `best >= accept_threshold(0.36)` かつ `best - second(別ユーザ) >= margin(0.06)`。
  曖昧 (best≈second) は**拒否**して誤束縛を防ぐ。候補 1 人なら margin 自動成立。
- **IdentityResolver (時間方向)**: 1 フレーム照合は誤りうるので track ごとに票を貯め、
  `勝者票 >= min_votes(5)` かつ `勝者 - 次点 >= vote_margin(3)` で束縛。
  Lost track の票は `purge()` で破棄。

いずれも **OpenCV 非依存・単体テスト済** (`test_face_identity`)。埋め込み抽出 (SFace) のみ gated。

## レイヤ分離

| 層 | モジュール | 依存 | テスト |
|---|---|---|---|
| 照合コア | `identity_matcher` / `identity_resolver` | なし | `test_face_identity` 9 件 green |
| 埋め込み | `face_embedder` (SFace) | OpenCV (gated) | 実映像未検証 |
| 束ね | `player_tracking_pipeline` | OpenCV (gated) | 実映像未検証 |

PlayerTracker は identity を**知らない** (SRP)。pipeline が embed→resolver→PlayerPosition を繋ぐ。

## Cernere 連携

- **保管先**: `managed_projects` の ludellus プロジェクト `project_data_ludellus` に
  `biometric_face` 列 (`type: json`, `module: "biometric"`)。
  中身: `{ model: "sface_2021dec", embeddings: number[][], updated_at }`。**生画像は持たない**。
  登録 migration = Cernere PR #129 (現行 zod `ProjectDefinition` columns 形式, validate 済)。

- **採択A: native (cernere_face_service) が /ws/project を直接保持**。
  enroll / roster 取得 / revoke はすべて native が担い、renderer には project secret を渡さない。
  プロジェクト接続 (`managed_project.set_user_data` / `get_user_data` / `delete_user_data`) は
  native の `cernere_face_service` が実行する。

- **renderer の役割 = consent / opt-out 専任**:
  - `cernere-commands.js` の `userSession` のみ残存:
    `my_data {projectKey}` / `optout {projectKey, moduleKey:"biometric"}` / `remove_optout`。
  - `consent.js`: 明示同意ゲート (同意なき enroll は ConsentError)。
  - enroll/roster/transport/ipc-contract の renderer 実装は削除済 (採択A で native が担う)。

- **ユーザ接続 (opt-out)** は renderer のユーザセッションから `/auth` 経由で直接送る。
  payload に `projectKey`/`moduleKey` を載せる (userSession.*) 規約に準拠。

## 同意・プライバシー (生体データ)

- **明示 opt-in**: 「登録する」行為そのものが同意。未登録ユーザにはテンプレが存在せず識別対象外。
- **撤回**: `user_data_optouts` の `biometric` module を opt-out → テンプレ削除。
- **生画像は一切保存しない** (埋め込みのみ、Cernere に)。照合は Ludellus 内で一過性。
- **roster 限定**: gallery は参加者のみ。session 終了で破棄。グローバル生体DBを作らない。
- 露出: identity は user_id(FK) のみ。表示名等の個人データは [[個人データ保管禁止]] どおり
  Cernere lookup で都度解決。

## 残・未検証

- **native の Cernere クライアント実接続 (採択A)**:
  `cernere_face_service` のロジックは node:test 済だが、実 WS アダプタ (`ergo::bind::ws::Client` 配線 +
  `build_login_body`→HTTP POST→`parse_project_token` でのトークン取得) は未配線。
  client_secret は OS keychain/env。expiresIn(3600s) 失効時は再 login。
  実 Cernere 疎通 + enroll capture(顔→SFace→enroll) は未配線。
- **enroll UI + 同意 UI**: 同意文 (policyVersion) 提示 → `consent.agreed` 収集 → 顔数枚撮影 →
  native enroll トリガー。UI フレーム未実装。
- `face_embedder` / `player_tracking_pipeline` は OpenCV 環境での実コンパイル・実映像未裏取り
  (gated)。SFace は本来 5 点 alignCrop が望ましい (現状クロップ整形の劣化版)。
- accept_threshold/margin/min_votes の実データチューニング (SFace 既定近辺から)。
