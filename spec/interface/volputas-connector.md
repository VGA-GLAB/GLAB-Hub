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
- UI は「ゲームレビュー」「ゲームアンケート」「ほかの人への質問」「感想」「感情曲線」の
  5タブを提供し、アンケート系タブは回答済み・未回答を一覧へ表示する。
- ゲームマスタの正本も Volputas。GLAB は登録画面と中継だけを持つ。

## ゲームマスタ

感想と感情曲線の「ゲーム名」は自由入力だった。表記ゆれで同じゲームが別物として溜まり、
学内制作ゲームは Steam の直近プレイにも出ないためサジェストからも選べない。管理者が
登録したゲームから選ばせる。

- `GET /api/x/volputas/games` — 公開中のゲーム一覧 (全員)。停止中のゲームを
  含める一覧は、hub が `GET /api/x/volputas/games/admin` の管理者専用経路から取得する。
- `POST /api/x/volputas/games` / `PATCH /api/x/volputas/games/:id` — 登録・更新。
  hub 側で `requireAdmin` を通す。**ただし権限の正本は Volputas 側**で、Cernere project
  token の `role` クレームで判定する。hub の `requireAdmin` は画面と操作を出すかどうかの
  判断でしかなく、GLAB を迂回されたときには効かない。
- ゲームが 1 本も登録されていない間は、感想フォームは自由入力に落ちる。選択専用にすると
  1 本目が登録されるまで誰も感想を書けなくなる。
- 運用停止は `isActive: false`。行は消さない (紐付いた感想と回答を失わないため)。

ゲーム別アンケートは `POST` / `PATCH /api/x/volputas/surveys` で管理者が登録する。設問は
catalog 契約の形 (`scale` / `choice` / `freetext`) に限る。既定は非公開で、内容を確認して
から `{"visibleToGlab": true}` で公開する。

## 感情曲線

動画を上げて、再生しながらスタンプを打ち、LLM に評価させる。中継は
`/api/x/volputas/evidence/*`。

- 手順は 記録作成 → 動画アップロード → 評価 の 3 手。動画の置き場が記録 ID で決まるため
  この順序は入れ替えられない。
- 動画とゲームログは `proxyStream` で中継する。既定の `proxy()` は本文を文字列として読み、
  応答も一度テキストにしてから返すので、動画には使えない。
- 再生は `<video>` が直接引くため Authorization ヘッダを付けられない。Volputas が発行する
  短命チケットで認可する。Volputas は自分のパスで URL を返すので、GLAB 側はチケットだけを
  取り出して自分の中継口へ付け替える。

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
  `plugins/volputas/games-panel.ts`（ゲームマスタ）/
  `plugins/volputas/emotion-curve-panel.ts`（感情曲線）/
  `plugins/volputas/contracts.ts`（parser）/
  `plugins/volputas/review-digest.ts`（ダイジェストの切り詰め）/
  `plugins/shared.ts`（`proxyStream`）/
  `plugins/projects/panel.ts`（projects カード）
- テスト: `tests/volputas-reviews-contract.test.ts` /
  `tests/volputas-game-catalog.test.ts`
- Volputas 側: `spec/feature/glab-game-catalog.md` / `spec/feature/glab-emotion-curves.md`
