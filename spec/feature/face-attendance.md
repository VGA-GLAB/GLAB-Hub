# 機能: 顔認証・動体検知による出席/在席確認 (GLab 適合版)

> 分類: feature (**実験的 / Phase 5**)。Ludellus の
> [player-tracking](../imported/ludellus-player-tracking.md) (動体検知・セッション内追跡) と
> [face-identity](../imported/ludellus-face-identity.md) (roster 限定 1:N 顔識別) を
> GLab の出席・在席確認用途に適合させたもの。原本は `spec/imported/` にコピー保管。
> 一次経路はあくまで passkey チェックイン ([attendance](./attendance.md)) と
> COCOIRU 自動出席であり、本機能はその**上乗せ (ハンズフリー化)**。

## 目的

- ラボ室入口/室内のカメラで、入室したメンバーを自動的に出席記録する (打刻レス)。
- 在席中は動体追跡 (Coasting 含む) で「まだ室内にいる」を維持し、退室を検出する。
- 出席記録は GLab-Hub の `glab_attendance` に `source = "face"` として書き込む。

## 移植元との差分 (適合レビュー)

Ludellus 仕様をそのまま使えない点を洗い出した結果。**変更が必要な 7 点**:

| # | Ludellus (原本) | GLab (適合) | 理由 |
|---|---|---|---|
| 1 | roster = MR セッション参加者数人 (参加時に認証済 = 既知) | **roster = GLab メンバー名簿全員 (数十人) を常駐 gallery 化** | 出席確認は「誰が来たか未知」の状態で当てる用途。roster 前提が崩れる最大の変更点 |
| 2 | accept_threshold 0.36 / margin 0.06 / min_votes 5 | **初期値を accept 0.45 / margin 0.10 / min_votes 10 に強化**し、実データで再チューニング必須 | 候補人数増で誤束縛率が悪化する。出席では誤検出 = 虚偽の出席記録であり影響が重い (false accept を強く抑制、false reject は代替経路で救済) |
| 3 | 「個人識別はしない」(player-tracking 単体) | **個人識別が目的そのもの** | 用途の本質が変わる。同意文 (policyVersion) に「出席管理目的」を明記し直す |
| 4 | 同意 = 「登録する」行為 (ゲーム用途) | **出席管理専用の同意フロー**: 利用目的 (出席記録)・保管するもの (埋め込みのみ、生画像なし)・保管期間・撤回方法を明示。未成年は学校の運用に従い保護者同意を確認 | 学校の出席管理は法務要件が重い。ゲーム参加同意の流用不可 |
| 5 | 識別結果は非永続 (PlayerPosition に載るだけ) | **識別結果 (user_id + 時刻 + 入退室) を `glab_attendance` に永続化** | 出席は記録が目的。保管場所・期間ポリシーを新設 (データ仕様参照) |
| 6 | gallery はセッション終了で破棄 | gallery はエージェント稼働中は常駐 (毎朝 Cernere から再取得、**ローカル永続はしない**) | 常時在席監視のため。ディスクに書かないことでグローバル生体 DB 化を回避 |
| 7 | biometric_face は `project_data_ludellus` に保存 | **`project_data_glab` に別 module として保存** (形式は同一: `{ model: "sface_2021dec", embeddings, updated_at }`) | プロジェクト境界の分離。Ludellus に登録済みでも GLab では別途 enroll (同意も別) |

**変更しない (そのまま流用する) もの**: track FSM (Tentative/Confirmed/Coasting/Lost)、
等速度モーションモデル、外見 ReID (HSV ヒスト + 任意 OSNet)、IdentityMatcher /
IdentityResolver の照合コア (単体テスト済)、YuNet / SFace / YOLOv8 のモデル選定、
「生画像を一切保存しない」「テンプレは Cernere 単一情報源」「opt-out でテンプレ削除」の
プライバシー原則、native が /ws/project を直接持つ採択 A 構成。

## アーキテクチャ

```
[ラボ入口/室内 カメラ端末 (glab-face-agent)]
  camera → PersonDetectionSource → PlayerTracker (動体追跡)
        → FaceEmbedder(SFace) → IdentityMatcher (名簿 gallery 1:N)
        → IdentityResolver (時間方向投票)
        → 入退室イベント化 (FSM: Confirmed=在席 / Coasting=一時ロスト / Lost=退室候補)
        → POST {GLAB_HUB_URL}/api/attendance/checkin  (source="face")
           POST {GLAB_HUB_URL}/api/attendance/checkout (退室、任意)
[Cernere]
  project_data_glab.biometric_face — enroll/roster 取得/revoke (project credentials WS)
[GLab-Hub]
  glab_attendance に記録 → attendance パネル / Discord 通知
```

- **glab-face-agent** = Ludellus `native/src/input/tracking/` + `native/src/identity/` を
  流用したスタンドアロン常駐プロセス (カメラ端末上)。ゲームランタイムは持ち込まない。
- GLab-Hub への送信認証はサービストークン (`GLAB_FACE_AGENT_TOKEN`、暗号化 config 保管)。
- 入退室マッピング: track が `Confirmed` になり identity 束縛が成立した時点で入室 (チェックイン)。
  `Lost` が退室猶予 (`exit_grace`, 既定 10 分) 継続したら退室。Coasting 中は在席扱い
  (下を向く・カメラに背を向ける程度では退室にしない — Ludellus の Coasting 設計をそのまま活かす)。
- チェックインは 1 日 1 回冪等 (サーバ側 `glab_attendance` の UNIQUE で保証)。在席/退室は
  presence イベントとして別途記録 (任意フェーズ)。

## 同意・プライバシー (出席用途)

- **明示 opt-in**: GLab-Hub の Web UI から本人が enroll (顔数枚撮影 → SFace 埋め込みのみ保存)。
  未登録者は顔認証の対象外で、**passkey / COCOIRU / モバイルの既存経路で出席できる**
  (顔認証を出席の必須条件にしない — opt-out しても不利益がないことが同意の有効性の前提)。
- **撤回**: biometric module の opt-out でテンプレ即削除。以後 gallery にも載らない。
- **生画像・映像は一切保存しない**。カメラフレームは端末メモリ内で一過性。
- 出席ログ (`glab_attendance`) が保持するのは user_id (FK) + 時刻 + source のみ。
  表示名等は表示時に Cernere lookup (個人データ保管禁止に準拠)。
- 同意文書 (policyVersion 付き) に: 目的 = GLab の出席・在席確認 / 対象データ = 顔埋め込み
  (数値ベクトル) / 保存先 = Cernere 本人行のみ / 保管期間 = 在籍期間 + 撤回即時 /
  録画なし、を明記。未成年の保護者同意は学校運用に合わせて別途確認。

## 前提条件 (実装着手のゲート)

Ludellus 側で未検証の残作業が GLab 転用の前提になる:

1. OpenCV 実環境での `person_detection_source` / `face_embedder` / `player_tracking_pipeline`
   のビルド・実映像検証 (Ludellus 側 gated ON 裏取り)。
2. Cernere /ws/project 実配線 (`cernere_ws_adapter` + login→token) の疎通。
3. SFace の 5 点 alignCrop 実装 (教室環境の照明・顔向きバラつきに対し精度に直結)。
4. 名簿規模 (数十人) での accept_threshold / margin / min_votes の実測チューニング。

## レビュー結論

- 照合コア・追跡 FSM・プライバシー原則は流用可能で品質が高い (単体テスト green)。
- **リスクは (a) 名簿常駐 gallery 化による誤束縛率の悪化、(b) 出席という高影響用途への
  目的変更に伴う同意・法務、(c) OpenCV/実カメラ/実 Cernere が未検証である点**。
- よって本機能は Phase 5 (実験的) とし、passkey + COCOIRU で出席管理が安定運用に入った後、
  前提条件 1〜4 を満たしてから着手する。精度検証期間中は「顔認証の記録はドラフト扱いで
  本記録に昇格させない」シャドー運用から始める。
