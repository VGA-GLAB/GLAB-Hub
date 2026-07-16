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
- UI は「ゲームレビュー」「ゲームアンケート」「ほかの人への質問」の3タブを提供し、
  回答済み・未回答を一覧へ表示する。

Volputas 未設定時も GLAB は degraded で起動し、パネルは「未接続」を表示する。
設定値が存在するのに不正な場合は silent fallback せず起動を失敗させる。
