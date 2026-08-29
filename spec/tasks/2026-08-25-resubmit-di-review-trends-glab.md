---
task: resubmit-di-review-trends-glab
project: GLAB
kind: 運用
created: 2026-08-25
memory_links:
  - spec/tasks/2026-08-25-volputas-surveys-reviews-steam-trends.md
  - spec/interface/volputas-connector.md
  - spec/plan/glab-community-activation.md
---
# Di レビュー傾向版 GLAB PR の再提出

## 目的

旧方式の直接 Steam 取得を審査した GLAB #1071 を取り下げ、Di の取得済みレビュー傾向を
参照する修正版 head を Revisor の新しい local PR として審査へ出す。

## 分解

1. GLAB #1071 が旧 head のまま Open / Test OK であることを確認する。
2. Cc の権限付き close 経路で #1071 を理由付きで取り下げる。
3. `feat/glab-surveys-reviews-trending` の修正版 head と clean worktree を確認する。
4. Cc の local PR 正本経路から同ブランチを再提出する。
5. 新しい local PR が open になったことを確認し、Revisor の通知待ちで停止する。

## 完了条件

- 直接 Steam 取得を含む旧 #1071 がマージ対象から外れている。
- 再提出された local PR の head に Di review trend relay の修正が含まれる。
- GLAB は Steam Review API を直接呼ばず、Di が集計した匿名化済み傾向だけを利用する。
- Revisor の新しい local PR が Open で、審査結果を Cc 通知から受け取れる。
- session 自身は push、merge、auto-merge、main 更新を行わない。
