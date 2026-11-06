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

Role and private member-roster operations use exact route/method classifications.
Existing role definitions are shared with admitted members; own role and named
role-member lists are sensitive reads. Role definition changes and assignment/
removal require the current verified administrator, independently of any role
name in the URL/body. The endpoint retains its `requireAdmin` check. All member
roster enumeration, creation, mutation and linking remain administrator-only;
mutation/link/delete callbacks fetch the current target row immediately before
execution. The endpoint still validates body, linkage uniqueness and PII removal.
An absent row, revoked admission or downgraded administrator cannot use a prior
positive resource decision. No service permit replaces these GLAB decisions.

| Risk | Exact additional GLAB actions |
| --- | --- |
| read | roles.definitions.read |
| sensitive_read | roles.self.read, roles.members.read, roster.list, roster.link-candidates.read |
| important | roles.definition.save, roles.definition.delete, roles.member.assign, roles.member.remove, roster.create, roster.update, roster.link, roster.delete |

These thirteen actions require the matching administrator-owned Cr declaration
and consent before cutover. Unknown routes/methods remain denied. This unit does
not change existing optional roster name-resolution behavior or introduce new
authority credentials; remaining settings/target/consumer/runtime conditions are
still unresolved until separately verified.

Own profile/public-name/Steam profile operations retain the existing admitted
subject boundary. Their handlers always derive the target from getIdentity(c),
reject extra body fields and never select a user from query/body. Initial signup
fields remain Cr-owned; this classification does not grant pending applicants
new GLAB access. Each callback reads current admission before execution, and
Cr still enforces the current field/consent rules for the actual write.

| Risk | Exact additional GLAB actions |
| --- | --- |
| read | identity.settings-link.read |
| sensitive_read | identity.profile.read, identity.public-name.read, identity.steam-profile.read |
| important | identity.profile.update, identity.public-name.update, identity.steam-profile.update |

Steam fields use the canonical Cr authentication project `voluptas`, including
the optional Steam part of profile registration; the retired `volputas` alias
is never used for profile data authorization. The existing Cr project credential
must have explicitly configured access to those fields and the user must permit
the actual operation. No UI/storage rename or fallback credential is introduced.
These seven action/risk declarations, existing endpoint validation, other
consumer migrations, checkout reflection and runtime/cutover evidence remain
separate prerequisites; type checking alone does not prove live settings.

Project registry reads retain admitted-member visibility; private analysis and
named members/releases are sensitive reads. Create/edit/GitHub synchronization
and assignment/removal require current verified administration and current
project rows. Existing body/repository/file-path checks remain in the handlers.
TEAM detail requires an active project and current membership, even for an admin;
registry-wide visibility does not imply TEAM access. The endpoint repeats the
same current checks and filters the subject's team list.

Software catalog summaries expose only the existing published projection.
Draft/signing metadata and entry edits remain admin-only. Signed download is a
recipient-bound sensitive POST, with an8192-byte request bound and current
publication check. The existing endpoint independently validates recipient key,
nonce, pinned signature/hash, file bounds and current version/publication after
file read. No crypto, native attestation, release encryption or file protocol is
replaced. Admin entry input retains its16KiB ceiling.

| Risk | Exact additional GLAB actions |
| --- | --- |
| read | software.catalog.read |
| sensitive_read | projects.list, projects.detail.read, projects.releases.read, projects.analysis.summary.read, projects.analysis.file.read, projects.known-users.read, teams.own.read, teams.detail.read, software.catalog.manage.read, software.release.download |
| important | projects.create, projects.update, projects.github.sync, projects.member.assign, projects.member.remove, software.entry.save |

The seventeen action/risk entries need explicit administrator declaration and
consent. Service mirror paths are not user actions and retain their separate
service-principal authorization. Current endpoint ACLs and artifact validation
remain necessary after the shared guard; a permit is not data authorization.

## Remaining source routes before coordinated cutover

The following is a finite implementation inventory, not an allowlist. It was
compared with the22modules in plugins/pack.json and the actual route registrations.
Already-classified attendance, budget, profile, roster, role, showcase, forum,
consult and resident operations are excluded. Native resident migration remains
a separate unfinished consumer. Unknown methods/paths continue to be refused.

| Module | Remaining exact route/method shapes | Target dependency |
| --- | --- | --- |
| events (5) | GET facilities, GET meet/organizations, POST events, POST events/:id/meet, DELETE events/:id | Aedilis facilities/Meet; local list and own attendance are classified separately |
| facility (21) | GET facilities and facilities/:id; for reservations and meetings: GET collection, GET mine, POST collection, GET/PATCH/DELETE :id; POST meetings/:id/finalize, POST meetings/:id/glab-event, POST meetings/:id/responses, PATCH meetings/:id/responses/:responseId; GET meet/status, POST meet/oauth/start, GET meet/oauth/callback | Aedilis scoped target and callback/session binding; groups already classified |
| library (7) | GET equipment, GET/POST books, GET me, GET lookup, GET loans/mine, POST loans | Bibliotheca scoped target; local budget already classified |
| tirocinium (8) | GET companies, GET career-companies, PUT/DELETE career-companies/:relationType/:companyId; calls: POST collection, GET :id/events, POST :id/frames, DELETE :id | Tirocinium target/streaming call ownership; preserve other-owner/blocked task boundaries |
| di (4) | GET entry-points, POST discussion-launch, GET review-trends, GET conclusions | Discutere launch/identity contract and existing service-access integration must be checked separately |
| odeum (8) | GET status, GET live, POST sessions, POST sessions/:id/end, POST sessions/:id/viewer-ticket, GET sessions/:id/invitation, GET ticket-pubkeys, POST sessions/:id/program-ticket | Existing event audience/presenter/program owner checks and Odeum target/ticket contract |

These six groups total53route/method shapes. Corpus shared routes still need
explicit host decisions for declared data aggregation, capability invocation
and MCP. Overview/admin configuration and capability-list metadata are classified
by the later unit below. Declared downstream
metadata alone must not authorize a source resource or an arbitrary tool/action.
Static assets, health/public-config/auth-ceremony endpoints and external-service
mirrors are separate boundaries, not user-operation gaps to blanket-allow.
Action settings, target implementation, source checkout reflection and live
verification remain independent acceptance conditions for each row.

Resident presence/calls use only the exact group `glab` and verified subject.
Private reads, including lobby secret, are sensitive. Writes are important and
retain the8192-byte body ceiling. Call preparation rechecks the actual current
recipient lease, using a clone of the already bounded/captured request so the
endpoint's raw-body parser receives identical untouched bytes. Acknowledgment
requires the current recipient/id row; administrators cannot consume another
user's inbox. Endpoints retain rate/expiry/recipient limits and atomic broadcast.
The lobby secret is initialized by the module after schema setup with the same
existing standard randomness and conflict-safe insert; GET only reads current
state and returns503 if missing. It cannot create authority state via an ambient
cookie GET. There is no crypto/protocol replacement or new native attestation.

| Risk | Exact additional GLAB actions |
| --- | --- |
| sensitive_read | resident.active-members.read, resident.available.read, resident.inbox.read, resident.lobby-secret.read |
| important | resident.availability.update, resident.call.create, resident.call.acknowledge, resident.tasukete.create |

These eight declarations need explicit administrator consent settings. The
native Cocoiru caller still needs its own scoped-session migration; source
classification alone is not consumer completion. Other module/target/settings/
checkout/runtime conditions continue to block coordinated deployment.

Hub overview is a sensitive admitted-member read; capability-list metadata is a
read and does not authorize invocation. External-id mappings and discovery
configuration are private admin reads. Mapping reassignment and discovery update
are important administrator operations. Current verified GLAB administration is
required, independently of a role string in the request. The body is bounded to
64KiB and bound by the common digest/proof contract. Endpoint validation of the
actual mapping, config locks and update/transaction outcomes is still mandatory.

| Risk | Exact additional GLAB actions |
| --- | --- |
| read | hub.capabilities.read |
| sensitive_read | hub.overview.read, hub.external-ids.read, hub.discovery.read |
| important | hub.external-ids.reassign, hub.discovery.update |

These six actions require explicit administrator declarations/consent before
cutover. No manifest, connector prefix or MCP tool is trusted merely because a
metadata-list operation was permitted. Generic data requires its actual current
manifest/action/project/target/resource binding to be resolved and authorized;
arbitrary capability invocation and tools/call remain unclassified and denied.
This unit adds no credential, dependency, communication or dynamic execution.
Other source/target/settings/checkout/runtime prerequisites remain unfinished.

Local event list and own attendance are separate from operations that reserve
facilities or issue/cancel Meet links. The list is a sensitive read and retains
the endpoint's per-row audience/role projection, with roles resolved after the
asynchronous event-list read. Attendance read/absence
update require the actual current event, current admission/roles/audience, a
meeting-derived single occurrence and verified subject. The callback rechecks
admission after its asynchronous PostgreSQL read. Writes also require the event
not to have ended; admin does not override occurrence/end-time constraints.
The existing endpoint repeats current checks and strictly accepts only `absent`
for the verified subject. Shared proof consumption and the PG/SQLite operations
are not a distributed transaction; execution failures are not automatically retried.

| Risk | Exact additional GLAB actions |
| --- | --- |
| sensitive_read | events.list, events.attendance.read |
| important | events.absence.update |

These three administrator declarations/consent permissions are required before
switch. The five external event operations and their Aedilis target contract
remain unclassified. Other source/native/target/settings/checkout/runtime
prerequisites still block coordinated deployment.
