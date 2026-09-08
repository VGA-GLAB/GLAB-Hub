# GLAB 外部契約引渡し

task-workflow §2.1 の5key frontmatterで、所有repoに新規taskだけを追加した。
Corpus/Cernereともローカルmainから `docs/glab-contract-handoff-20260908` worktreeを作成した。

| 所有repo | 新規task | GLAB側依存・受入条件 |
|---|---|---|
| Corpus | `spec/tasks/2026-09-08-glab-host-policy.md` | pluginとhub集約の両入口を同じ部員policyで保護。提供まで部員認可の部分導入をしない |
| Corpus | `spec/tasks/2026-09-08-glab-service-routes.md` | userとmachineを分離し、notification read/ack以外へ到達不能 |
| Corpus | `spec/tasks/2026-09-08-glab-token-cache-lifecycle.md` | 同一keyのin-flight共有、失敗の除去、expiry掃除と1024件上限 |
| Corpus | `spec/tasks/2026-09-08-glab-bootstrap-cleanup.md` | hard exitをhostに伝播し、GLABのclient/store cleanupを保証 |
| Cernere | `spec/tasks/2026-09-08-glab-notifier-machine-principal.md` | 専用principal、固定scope/audience、短命token、generation/key別失効照会 |

参照先本体: `E:/Document/Ars/Corpus`、`E:/Document/Ars/Cernere`。
引渡しworktree: `E:/Document/Ars/Corpus-glab-contract-handoff-20260908`、
`E:/Document/Ars/Cernere-glab-contract-handoff-20260908`。
PR承認前のtaskはworktree内にある。本体へ取り込まれたとは扱わない。

依存順は Cernere machine principal → Corpus service route → GLAB notification/journal。
部員認可は Corpus共通hook → GLAB schema/policy/API/UI → 両入口の受入。
共有clientの通常終了はGLABで実装し、Corpus hard exit経路の保証は外部契約提供後に追加する。
Tela–Orbis連携はnecoが所有側へ用意する予定で、GLAB側要求は別紙 `2026-09-08-tela-orbis-desktop.md`。
