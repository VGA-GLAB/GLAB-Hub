# [imported] 機能: プレイヤー位置追跡 (顔 + 外見 ReID)

> **出典**: `LUDIARS/Ludellus` `spec/feature/player-tracking.md` (2026-07-10 時点 main) の原本コピー。
> GLab 用の適合版は [face-attendance](../feature/face-attendance.md) を参照。
> 本ファイルは参照用スナップショットであり、GLab 側では編集しない (更新は Ludellus 側が正本)。

---

# 機能: プレイヤー位置追跡 (顔 + 外見 ReID)

> 分類: feature。 MR (AR-Menco) のカメラ映像から「誰がどこにいるか」を推定し、
> **顔を見失っても** 服の模様・髪型などの外見特徴と動き予測で位置追跡を継続する。

## 目的・ユーザーストーリー

- 投影面/プレイ空間を撮るカメラから、各プレイヤーの床/画面上の位置を得たい。
- プレイヤーが下を向く・後ろを向く・一瞬隠れる等で **顔が見えなくなっても** 同じ人を
  見失わず追い続けたい (track ID を維持したい)。
- 識別材料は **服の模様 (胴体) / 髪型・髪色 (頭部) / 直前位置からの類推 (動き)**。

## スコープ外 / ポリシー

- **個人識別はしない**。登録済みプレイヤーと顔を照合する「顔認識(identification)」は
  生体個人データであり、LUDIARS 規約上 Cernere 単一情報源・自前 DB 保管禁止 (AIFormat §5)。
  本機能は **セッション内トラッキング** のみ — 外見ディスクリプタも顔も in-memory 限り、
  非永続。誰であるかは問わず「同じ track」を保つだけ。

## 振る舞い (映像 → 観測 → 追跡 → 位置)

```
[camera frame (cv::Mat)]
   → PersonDetectionSource  顔(YuNet) + 体(YOLOv8-person) + 外見抽出
         → PersonObservation{ body, has_face, face, appearance }
   → PlayerTracker          tracking-by-detection + FSM
         → PlayerTrack{ id, state, motion, appearance, face_visible }
   → project_players(Homography)
         → PlayerPosition{ id, field座標, face_visible, coasting }
   → InputFrame.players へ載せてゲーム/ワールドへ
```

オーケストレータ `PlayerTrackingPipeline::process()` が上記を一気通貫で回す。

## 技術選定 (役割ごとに最良を当てる)

| 役割 | 採用 | 理由 |
|---|---|---|
| 顔検出 | **YuNet** (`cv::FaceDetectorYN`, OpenCV objdetect 内蔵) | NMS 込み単一 API。BlazeFace の anchor 自前デコード不要 |
| 体検出 | YOLOv8-person (ONNX, `cv::dnn`) | 顔が無くても追える体矩形。任意 (無ければ顔から体を推定) |
| 外見(服) | 胴体 HSV(H-S) ヒストグラム | 服の模様/色。モデル不要で常に効く再同定材料 |
| 外見(髪) | 頭部 HSV ヒストグラム | 髪色/明暗 |
| 外見(強) | OSNet 等 ReID 埋め込み (ONNX, 任意) | あれば再同定精度↑。L2 コサインで合成 |
| 追跡 | ByteTrack/DeepSORT を簡約した自前実装 | 動きゲート + 外見ゲートの和コスト貪欲割当 |

> **MediaPipe フレームワーク (Bazel) は不採用**。Windows ビルドが重く、既存 CMake+OpenCV と
> 衝突する。既存 `onnx_hand_source` 同様、必要なら「MediaPipe のモデルを ONNX で回す」だけにする。

## track FSM (状態 = 動的な現在地)

```
Tentative ──hits≥n_init──▶ Confirmed ──未検出──▶ Coasting ──再捕捉──▶ Confirmed
    │                                               │
  連続miss                                      max_coast超過
    ▼                                               ▼
   Lost ◀──────────────────────────────────────── Lost
```

- **Coasting** が本機能の核: 顔/体を見失っても 等速度モデルで位置を予測しつつ、
  外見ディスクリプタの一致で再出現を同一 track に結びつける。
- 対応付けゲート = `動きが近い OR 外見が強一致`。この OR が
  「顔を失い大きく移動しても **同じ服** なら再捕捉」を成立させる (単体テストで担保)。

## レイヤと依存 (アーキテクチャ規約)

- **コア (OpenCV 非依存・単体テスト可)**: `src/input/tracking/`
  - `player_types` / `appearance_descriptor` / `motion_model` / `player_tracker`
  - `homography` と同じ流儀で外部依存なし → `test_player_tracking` で headless 検証。
- **CV 検出 (SUIKA_ENABLE_MR_CAPTURE ゲート)**: `person_detection_source` / `player_tracking_pipeline`
  - OpenCV (core/imgproc/dnn/objdetect/videoio) 必須。未導入環境はビルドから除外。

## モデル取得 (リポジトリには含めない)

- YuNet 顔: `face_detection_yunet_2023mar.onnx` (opencv_zoo)
- 体: YOLOv8n の ONNX エクスポート (person クラスのみ使用)
- ReID: OSNet 等 (opencv_zoo / deep-person-reid)。
- `DetectionModelPaths` にパスを渡す。空/ロード失敗は graceful degradation
  (体モデル無し→顔から体推定、ReID 無し→HSV ヒストのみ)。

## テスト

`native/tests/test_player_tracking.cpp` (OpenCV 不要・10 ケース):
確定遷移 / Coasting→Lost / **顔ロスト後の外見再捕捉(ID 維持)** / 顔ドロップ時 ID 維持 /
homography 写像 / ヒスト・コサイン類似度 / IoU。

## 未検証 / 残

- `person_detection_source` / `player_tracking_pipeline` は OpenCV 導入環境での
  **実コンパイル・実映像での挙動が未検証** (gated ON 路線)。OpenCV を入れて
  `-DSUIKA_ENABLE_MR_CAPTURE=ON` でビルド裏取りが必要。
- カメラキャプチャ (`cv::VideoCapture`) からの実フレーム供給と InputFrame.players の
  実ゲーム配線 (worldplay / suika) は別 PR。
- しきい値 (kFaceScore 等) の config 化。
