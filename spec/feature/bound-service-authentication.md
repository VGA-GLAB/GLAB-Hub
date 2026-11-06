# SPEC-GLAB-BOUND-AUTH-001: Bound GLAB authentication

GLAB uses its own opaque HttpOnly service session through Corpus. The Corpus pin
adopts the reviewed local Cr project/PKCE and operation-guard SDK; no global Cr
user access/refresh token or five-minute positive authorization cache is retained.
The new local dependency commits are implementation candidates, not upstream
approval or deployed versions.

`plugins/access/operation-policy.ts` declares each permitted method/path/action/risk
and runs GLAB-owned current admission/resource checks after Cr consumption. GET can
be sensitive (identity, admission requests, GPS evidence, budgets, downloads).
The existing admission middleware and endpoint row/transaction checks remain
mandatory. Cr's role or active result never replaces these checks. Unknown paths
are denied; a module-wide GET or mutation fallback is forbidden.

Downstream requests use one-operation `Cernere-Delegation`, bound to the explicit
destination project/audience, actual path/query/method/serialized bytes and semantic
headers. `downstream-operations.ts` is the server-owned consumer contract proposed
for adoption by the destinations, not proof that they already implement it.
Booking assertions are included in semantic-header binding. No local session or
global Cr credential is forwarded. Missing classification/authority results are
controlled unavailable responses; anonymous or caller-header fallback is forbidden.

This migration is incomplete and must not be deployed. Currently only the explicit
core identity/metadata, admission, attendance, GPS evidence, budgets and showcase routes are
classified; other routes intentionally fail closed until their current ACL is
reviewed. The organization-membership WS is replaced by the own-session identity
provider. The retired Cr photo/template client, relay and upload UI are removed,
in accordance with Cr's 2026-09-12 facility-only biometric policy. Current face-consent
routes use the provider and fixed operation classifications, while policy text is
fetched from Cr's existing public endpoint without credentials. GLAB's login uses
the shared code/verifier exchange and configured client ID. Target consumers and
remaining GLAB classifications are still incomplete. The next finite classification unit covers
dashboard subject data/completion, jobs self career/owner workflows, tech-link rows/comments,
quests owner/project/revision/approver workflows and the two public Tendentia projections.
All member-data GETs are sensitive reads. Mutations are important, recheck live admission and
row ownership/roles, and retain each endpoint's conditional write/schema checks. Unknown routes,
service-only external endpoints and unreviewed modules remain denied. Media transfer now adopts published accepted
Cr71d6c368/Co8db51a21 bounded-upload source contracts. The initial feature-head169a114 pin was not
publicly fetchable; the submodule now uses the published merge. ProfileMediaStore.MEDIA_RULES/evidenceMedia
are the correct target, rather than the spectator mediaPolicy. Explicit screenshots/voice-memos/videos/game-logs
routes retain20MiB/50MiB/2GiB/100MiB limits respectively and300second
capture/transfer deadlines; the generic32MiB small-body ceiling remains unchanged elsewhere. The host
rechecks current GLAB admission after local permit consumption. Voluptas must additionally reserve and
finalize the source-fixed body and consult current record/asset ownership immediately before its write;
GLAB admission and Cr authorization never replace that target permission. This target migration is still
required before cutover. A backend-only exact captured Blob goes to the selected connector with
Cernere-Upload; raw arrayBuffer re-materialization, caller-supplied digest and ordinary credential fallback
are forbidden. Capture/SDK handles size/time/quota/disconnect/revocation failure and cleanup.

Upload results are independently bounded to64KiB and fully consumed before aborting the outgoing transfer,
awaiting its owned Blob reader shutdown and releasing source capture. Merely firing abort is not teardown
completion, including when the HTTP consumer holds its output stream lock. Oversize, disconnect or unknown result returns an explicit unknown outcome
without automatic retry; the destination may already have committed. Ordinary GET/Range keeps streaming
binary responses and partial-response headers. Contract sources cover exact Blob identity above32MiB,
missing-capture rejection, result bounds/disconnect and live admission changes. Runtime execution remains
Revisor-owned. No restart, GLAB Revisor submission or deployment is claimed here.

Attendance collection/own-history/event-list GETs and automatic facility-target
discovery are explicitly `sensitive_read`; check-ins, manual entries and event
requests/approvals are `important`. Every callback reads current GLAB admission;
administrator-only ledger/manual routes retain that condition. Event approval also
loads the actual current occurrence, current audience roles and requested subject,
and requires the event creator even when the caller is an administrator. Endpoints
retain their proof, subject, nonce, row and transaction checks. GPS multipart intake
keeps its existing 10 MiB photograph plus 64 KiB form limit. Unknown paths/methods
remain denied. Contract sources cover admission/role/organizer/request changes,
unknown routes and the GPS limit; they were typechecked, not executed by this session.

Static checkpoint: GLAB server/frontend and the migrated bound-operation, consent,
membership, connector, login and startup contract sources typecheck. The worktree
uses read-only junctions to existing canonical dependencies; they are not fully
lock-aligned. A no-emit comparison against canonical GLAB main confirms the remaining
node:sqlite/older Node types and unrelated contract fixture errors already exist there.
Bot's existing dependencies are also linked read-only for the worktree's type resolution.
The matching
locked dependency restoration/import review remains required before final review.
The catalog mode/project-key changes are prepared configuration, not applied runtime
configuration; every consumer and administrator-owned Cr policy must be ready first.

The parent Cr migration has the official Actio reference
`actio:e0acdef1-32ef-40a8-bc38-be2250bed9cb`, created after existing-task comparison
and linked to neco's explicit implementation/completion instruction. Its current
status remains in progress. The GLAB-owned migration is now linked to
`actio:681667b9-144a-47b6-857e-72b9e5fec82e`, created through the official taskflow
after comparison with the49existing GLAB tasks. It references parentCr and Corpus dependency
`actio:9b574513-b42c-4b47-9840-f7d69797859c`; older anonymous-fallback/external-contract/WS-sharing
tasks are retained as separate requirements. Initial review may integrate source while remaining
classification/target/cutover work stays in progress; this partial state must not be deployed.

Administrator declaration for this classification unit must enumerate these exact
actions and risks; the service does not infer a declaration from a prefix:

| Risk | Actions |
| --- | --- |
| read | dashboard.permission-settings.read, trends.entry-points.read, trends.map.read |
| sensitive_read | dashboard.summary.read, dashboard.membership.read, dashboard.location.read, dashboard.permissions.read, career.self.read, links.list, links.tags.read, links.read, links.comments.read, jobs.list, jobs.owners.audit, quests.pending.read, quests.own.read, quests.published.read |
| important | links.create, links.update, links.delete, links.comments.create, jobs.create, jobs.close, jobs.owner.update, jobs.owners.rollback, career.self.update, dashboard.daily-quest.complete, quests.create, quests.update, quests.submit, quests.withdraw, quests.decision |

The current-row callbacks supplement endpoint authorization. Job conditional
revision updates and quest compare/revision writes remain the final transaction
boundary; a changed owner/role/project/revision cannot be replaced with a cached
positive result. Other unreviewed operations stay unclassified and refused;
this table is not a complete cutover manifest. Subject-bound location mutation
is covered by the later presence unit, retaining its live endpoint permission check.

The Voluptas caller unit adds the explicit survey/review/game/emotion-curve
actions, preserving live GLAB admission and local administration. Voluptas
independently consumes the scoped downstream proof and checks current survey
publication, record ownership and Cr admin role (target PR3640). All personal
GETs are sensitive; writes/evaluation are important. Small JSON routes use the
target-owned1MiB ceiling, while the four media routes retain their own bounded
upload policy. Source identity/permit alone never authorizes target rows.

The fixed recent-games path is `reviews/recent-games` at the target. The earlier
root recent-games caller and source classification are removed. Analysis catalog
is explicitly `review.analysis.catalog`/read before private record-id matching;
POST catalog and unknown routes/methods remain refused. Administrator declaration
must include the exact target action/risk table in Voluptas
`spec/feature/glab-scoped-catalog-delegation.md` on both relevant projects, plus
GLAB-only `games.admin.read`/sensitive_read. Settings, direct runtime checks and
other unfinished module/consumer migrations still block coordinated deployment.

Authentication destination project is `voluptas`, as required by Cr migration063,
the Ex launch target and the actual service manifest. The retired `volputas`
project spelling is rejected. Existing GLAB module/connector IDs and browser
`/api/x/volputas` URLs are distinct identifiers; none can select the auth project.
No physical data/table/storage_slug is renamed by this authentication correction.

Forum/consult classification preserves existing GLAB data policy. Forum detail
and comments re-read the current thread audience/roles; list projection still
filters every row in the endpoint. Thread delete is creator/admin, pin is admin.
Consult boards are shared with admitted members, while resolve is creator/admin
and the presence roster is administrator-only. Self availability/location use
only the verified subject; the endpoint must still query current canEditPresence
immediately before writing and refuse missing/denied permission. The common
gate supplements that check. Bot external routes keep their separate service
principal boundary and are not user operations.

| Risk | Exact additional GLAB actions |
| --- | --- |
| sensitive_read | forum.threads.list, forum.thread.read, forum.comments.read, consults.list, consult.read, presence.self.read, presence.members.read |
| important | forum.thread.create, forum.thread.delete, forum.thread.pin, forum.comment.create, consult.create, consult.resolve, presence.self.update, dashboard.location.update |

These declared actions/risks need explicit administrator consent permissions
before switch. Unknown methods/paths stay refused; current resource checks are
repeated without a positive cache. Other unfinished modules/targets/consumers
and settings/runtime evidence still block coordinated deployment.
