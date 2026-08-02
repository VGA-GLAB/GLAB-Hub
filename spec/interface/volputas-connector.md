# interface/ — Volputas アンケート連携

GLABはVolputasのゲームレビュー・ゲーム嗜好アンケートを複製せず、Corpusの
connector で Volputas の死活とアンケート API を集約する。回答 UI は GLAB の Corpus
パネル内で描画し、Volputas Web UI やログイン画面へ遷移しない。

## 境界

- `VOLPUTAS_URL` は API / health の base URL。Excubitor topology が注入する。
- URL は絶対 HTTP(S) のみ許可し、credential・query・fragment を含む設定は起動時に拒否する。
- ゲームレビューは開発作品・市販作品の両方を対象とする定性評価として投稿する。
- 設問 JSON とアンケート一覧は Volputas が所有する。
- 回答は Volputas と共有する Cernere の `volputas_survey_responses` /
  `volputas_survey_answers` に、可変長 TEXT または INTEGER の正規化フィールドで保存する。
- GLAB は Cernere user access token から Volputas 用 project token を発行し、
  `/api/v1/integrations/glab/surveys` を中継する。追加の Volputas ログインは要求しない。
- UI は「ゲームレビュー」「ゲームアンケート」「ほかの人への質問」「感想」の4タブを提供し、
  アンケート系タブは回答済み・未回答を一覧へ表示する。

## コミュニティ感想フィード

ドメイン: `game-feedback` (`.anatomia/domains/game-feedback.*.json`)。
実装関数は下記の clause ID を `@implements` で参照する。

- **SPEC-VOLPUTAS-REVIEWS-001** —
  `GET /api/v1/integrations/glab/reviews?projectId=&limit=&offset=` は、`visibility='community'`
  の感想だけを返す。`projectId` を指定すると GLAB プロジェクト ID で絞り込む。
- **SPEC-VOLPUTAS-REVIEWS-002** —
  `POST /api/v1/integrations/glab/reviews` はゲーム名、本文、`polarity` (`like` / `dislike`)、
  `recommend`、任意の `glabProjectId`、匿名指定、明示的な `visibility` を受け取る。
  GLAB パネルは公開投稿に `visibility='community'` を指定する。
- **SPEC-VOLPUTAS-REVIEWS-003** —
  `GET /api/v1/integrations/glab/recent-games` は最近遊んだゲームの候補として
  `{ name, playtimeTwoWeeksMinutes }[]` を返す。
- **SPEC-VOLPUTAS-REVIEWS-004** —
  GLAB はこれらをモジュール mount 先の `/api/x/volputas/reviews`、
  `/api/x/volputas/recent-games` として中継し、すべての proxy 応答に
  `cache-control: private, no-store` を付与する。
- **SPEC-VOLPUTAS-REVIEWS-005** —
  projects パネルのカードは `/api/x/volputas/reviews?projectId=&limit=` でダイジェストを
  表示し、本文の投稿・全件閲覧は volputas パネルの「感想」タブが担う。
  ダイジェストは本文を先頭 120 文字で切り詰める (カード一覧を長文で埋めない)。
  hub のタブ状態は URL から復元しないので、projects カードからレビュータブへ遷移はしない。
  「感想を書く」は現在の URL へ `?projectId=` だけを書き足し (`history.replaceState`)、
  レビュータブを開くよう案内する。ページ遷移するとタブがステータスへ戻るだけで、
  パネル状態を捨てる分だけ損をするため。
  volputas パネルは `?projectId=` があるとき「感想」タブを初期表示し、同 ID で絞り込む。
  絞り込みの解除は URL から `?projectId=` を取り除く (パネル再 mount で解除が巻き戻らないため)。
  感想の取得に失敗しても絞り込み解除の導線は残す。
  Volputas 未接続 (503) のとき、projects カードは失敗ではなく「未接続」を表示する。
  感想の投稿も 503 は「未接続」、それ以外の失敗は status 付きで区別して伝える。
- **SPEC-VOLPUTAS-REVIEWS-006** —
  感想系の 2 エンドポイントは `{ ok, data }` 包みではなく素の JSON 配列を返す
  (アンケート系との差分)。GLAB 側の parser もその前提で検証する。

Volputas 未設定時も GLAB は degraded で起動し、パネルは「未接続」を表示する。
設定値が存在するのに不正な場合は silent fallback せず起動を失敗させる。

## 関連

- コード: `plugins/volputas/index.ts`（proxy）/ `plugins/volputas/panel.ts` /
  `plugins/volputas/contracts.ts`（parser）/
  `plugins/volputas/review-digest.ts`（ダイジェストの切り詰め）/
  `plugins/projects/panel.ts`（projects カード）
- テスト: `tests/volputas-reviews-contract.test.ts`
