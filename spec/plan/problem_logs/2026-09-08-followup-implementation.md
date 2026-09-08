# 設計後の実装と worktree 登録障害

- Date: 2026-09-08
- Status: binding resolved; implementation ready for review
- Area: GLAB / Cc repository binding

## Evidence and cause

9件のタスクは fed9a70 に保存済み。前回の PR 提出と今回の implementation bind で再現した登録障害は、
sandbox が作成した worktree の `.git` と Cc 実行ユーザーの所有者相違による Git の dubious ownership。
2026-09-08 に実装 worktree の絶対パスだけを実行ユーザーの safe.directory に追加し、bind 成功と
repo_path / repo_origin / branch の一致を確認した。ワイルドカードの信頼設定やサービス再起動はしていない。

## Implementation requirements

Calliope 固定 token 欠落時は fetch 前に503、owner 移行は証跡と CAS、client 終了は全資源の解放を守る。
Corpus host policy hook と Cernere machine principal は現行ソースに提供契約がなく、所有 repo へ引渡す。
契約提供前の GLAB 認可部分導入を完了扱いにしない。

## Verification

ユーザーの Session ポリシーによりテスト・起動・再起動は実行しない。
ソース差分と契約の静的レビューを実施し、未検証の動作・配布・データ更新は完了と報告しない。
TypeScript strict/noEmit診断0、C++20構文検査成功。範囲と残条件は
`../2026-09-08-followup-implementation-status.md` に記録した。
