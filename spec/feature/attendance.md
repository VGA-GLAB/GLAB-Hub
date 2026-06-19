# feature/ — 出席閲覧（Web hub `attendance`）

## 目的・ユーザーストーリー

GLAB メンバー / 管理者が、会場で行われた集会の**出席記録を Web hub で閲覧**する。
出席記録そのものは **Aedilis + Ostiarius**（会場 LAN ゲートウェイ + passkey attestation）が
生成する真実の源であり、GLAB は記録を**閲覧する Corpus コネクタ**として振る舞う（自前データを持たない）。

- メンバー: 自分の出席履歴を見たい。
- 管理者: 全員の出席一覧（施設・期間で絞り込み）を見たい。

## 振る舞い（入力 → 処理 → 出力）

- パネル（`plugins/attendance/panel.ts` → `panel.js`）が hub の中継ルートを叩く。
- 中継ルートは `HttpServiceConnector`（id `aedilis`）越しに Aedilis API へ透過：
  - `GET /mine` → Aedilis `/api/checkin/mine`（自分の履歴）
  - `GET /list` → Aedilis `/api/checkin`（admin、`?facility=&from=&to=`）
  - `GET /facilities` → Aedilis `/api/facilities`（施設名ラベル解決用）
- 受信した Bearer（Cernere トークン）をそのまま Aedilis へ転送 → Aedilis 側がユーザ権限で認可する。

## 制約・前提・既知の制限

- **物理チェックイン自体は GLAB の機能ではない**（会場 PWA / Ostiarius が
  passkey タップ → attestation → `POST /api/checkin/verify` を行う）。GLAB はレビュー面のみ。
- `AEDILIS_BASE_URL` 未設定時は connector が 503 を返し、パネルは「未接続（degraded）」を表示する。
- v0.1 では集計ビュー（期間別 / 人別）は未実装（DESIGN §8 follow-up）。

## 関連

- 接点: [`interface/aedilis-connector.md`](../interface/aedilis-connector.md)
- 流用元: Ostiarius（passkey チェックイン）/ Aedilis（出席記録）
