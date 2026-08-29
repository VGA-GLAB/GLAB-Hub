---
task: volputas-surveys-reviews-steam-trends
project: GLAB
kind: 実装
created: 2026-08-25
memory_links:
  - spec/interface/volputas-connector.md
  - spec/plan/glab-community-activation.md
  - DESIGN.md
---
# Volputas アンケート・感想動線と Di レビュー傾向

## 目的

GLAB 内で完結している Volputas のアンケート回答・ゲーム感想投稿の動線へ、
Di に取得・保存済みの Steam レビュー傾向を使ったゲーム候補を加える。本人の Steam
「最近遊んだゲーム」と公開中ゲームのレビュー動向を一つの「最近の流行り」欄へ統合し、
感想を書き始める際にゲーム名を探す負担を減らす。

## 分解

1. 公開中ゲームへ Steam ストア URL を登録・更新できる管理動線を追加する。
2. Di が取得済みレビューから返す匿名化済み傾向を Di module route で中継する。
3. Steam App ID を URL から安全に抽出して Di の傾向とゲームマスタを対応させ、
   外部レビュー本文や投稿者情報はブラウザへ中継しない。
4. 本人の最近プレイとレビュー増加作品を重複排除し、「最近の流行り」として感想フォームへ
   サジェストする。片方の取得失敗で他方を消さない。
5. connector 契約、domain membership、parser・集計ロジックの契約テストを更新する。

## 完了条件

- GLAB のアンケート回答と感想投稿は外部ログイン画面へ遷移せず、既存の Volputas proxy を使う。
- Steam ストア URL のある公開中ゲームは、Di に保存済みの直近 7 日レビュー件数で候補順位を決める。
- 「最近の流行り」は Di レビュー候補と本人の最近プレイを統合し、同名作品を重複表示しない。
- Di 未接続・タイムアウト・不正応答でも感想フォームと本人の最近プレイ候補は利用できる。
- GLAB は傾向表示のために Steam Review API へ直接アクセスしない。
- Steam レビュー本文、Steam ID、投稿者属性は GLAB のクライアント応答へ含めない。
