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
| facility (1) | GET reservations/:id (target handler absent) | Explicitly refused; groups, seven facility/reservation operations, ten meeting-poll and five managed Meet source operations are classified separately |
| tirocinium (5) | GET companies; calls: POST collection, GET :id/events, POST :id/frames, DELETE :id | Tirocinium target/streaming call ownership; own career companies are classified separately; preserve other-owner/blocked task boundaries |
| di (4) | GET entry-points, POST discussion-launch, GET review-trends, GET conclusions | Discutere launch/identity contract and existing service-access integration must be checked separately |

After meeting-poll, managed Meet and five cross-service event operations below, these three groups total10route/method shapes. The previous35 figure omitted GET/POST meet/:id: the actual earlier remainder was37, then seven facility/reservation, ten meeting-poll, five managed Meet and five event source operations were classified. Corpus shared routes still need
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

## Managed Meet source and private OAuth callback

Five source shapes use the existing accepted Ae managed Meet target
`/api/integrations/glab/meet` (Ae3671/public5289e153). Ordinary status and meeting
link GETs are sensitive; OAuth start, OAuth callback GET and meeting creation
are important. Exact source actions are `facility.meet.status.read`,
`facility.meet.oauth.start`, `facility.meet.oauth.complete`, `facility.meet.read`
and `facility.meet.create`. Admission and same bound subject/session are checked
currently; Ae independently keeps owner/audience, representative/admin, provider
state and Google account constraints. Unknown methods/paths remain refused.

Corpus is pinned to public16dbcae632e8a010a32f8ff90cf47f45a5b0f236, nested SDK
71d6c368 unchanged. The callback alone sets the host-owned `privateQuery: true`
classification (own service session, important GET, zero body). The standard
gate binds its original complete query with SHA-256 instead of sending code or
state in a Cr resource. Ordering, repeated values and encoded spelling are not
normalized for binding. Incoming delegation/upload cannot use this option.
This does not validate an OAuth response or create a new authentication method.

The handler separately requires exactly one decoded state and code and no error
parameter, including rejection of duplicated encoded parameter names. It relays
only the server-built JSON state/code under a newly signed context; callback
query is never copied to the destination path. The six destination actions are
`meet.status.read`, `meet.oauth.start`, `meet.oauth.complete`, `meet.read`,
`meet.create` and `meet.external.create`. Old `/api/meet` delegation mappings
are removed. The external event helper uses the new namespace, while the five
event source operations and their local owner/event-write integration remain
separate unfinished work, not implicitly allowed by this helper change.

Source actor/admission is checked again after awaited groups, body and target
response reads. An unknown/malformed successful target reply cannot produce a
successful OAuth result page. Callback pages use fixed messages, private
no-store and no-referrer and do not echo raw query values. Existing exact Ae
redirect allowlisting remains mandatory; an incoming Host/proxy hint cannot
expand it. Browser cookie is the existing Secure/HttpOnly/Lax opaque service
session; the provider state additionally binds the same user/source/redirect.

Cr source and destination action/risk/consent declarations, administrator
audience map and Google redirect/client configuration must be compared before
switching. No configuration, credential, provider scope, telemetry destination,
startup communication or dependency graph is added by the caller migration.
Actual provider roundtrip, canonical GLAB source synchronization and coordinated
all-consumer cutover remain unverified; no deployment or service operation.

Typed loss of that same booking actor (admission, subject/session or request
lifetime) is a fixed403 `current_booking_actor_unconfirmed`, `retryable:false`
before or after dispatch, consistent with the existing handoff denial contract.
It cannot return the downstream response. Actual unknown membership/authority
or connection failures remain503, never a public/anonymous fallback. This
distinguishes a refused owner from an unavailable lookup without allowing an
operation or automatically repeating an already-dispatched effect.

## Remaining event source operations

The five existing event shapes now declare `events.facilities.read` (read),
`events.organizations.read` (sensitive_read), `events.create`,
`events.meet.create` and `events.delete` (important). Their current admitted
subject remains mandatory. Meet issuance and deletion additionally read the
current event and require its creator or the authenticated administrator; the
browser cannot select owner/admin through a payload or query. Unknown methods,
unsafe/noncanonical ids and other action shapes remain refused. New source
actions do not grant arbitrary aggregation or replace target data authorization.
GET and DELETE have zero body; create has16384bytes and Meet8192bytes.

All source handlers recheck the same subject/session/admission and request abort
after awaited body, PG or target reads and before effects or disclosure. The
existing Ae requests use the accepted scoped target namespace and propagate the
actual request signal. Facilities retain the explicit available:false suggestion
status when only Ae is unavailable; missing current actor cannot use this branch.
An unknown Cr organization lookup returns503/available:false rather than a
successful empty membership. No new destination/provider scope is introduced.

Meet metadata and deletion acquire the current PG event row `FOR UPDATE`, then
recheck its owner/admin and source actor inside the same transaction. Deletion
includes occurrence-notification cleanup. New event insertion checks source
authority before and after its write in a short transaction. No transaction
contains remote Cr/Ae/Google HTTP. The stores are borrowed from their existing
startup owner; no request opens a new pool. Callback/driver contract tests and
actual Hono handlers use bounded fixtures without claiming a live PG rollback.

Cr consume, local admission, PG commit and Ae side effects are separate systems.
An effect already dispatched may finish while the caller ends. Unknown PG create
results return503 `event_creation_result_unconfirmed`, retryable:false. They
cannot automatically cancel a reservation which might belong to an event that
actually committed, and cannot automatically repeat creation. Reauthenticate and
compare the user's event/booking lists before an explicit reconciliation. No
reservation identifier, downstream private diagnostic or successful event data
is disclosed after actor loss. Normal creation without Meet still leaves an
event when optional Meet issuance fails, matching the existing feature.

After awaited remote cancellation, deletion re-reads the current event and
refuses a changed owner or booking/meeting linkage before transaction-local
deletion. The existing explicit force=1 option retains exactly the same current
owner/admin condition and bound query; it cannot acquire extra rights or force
delete a handed-off meeting after a failed Ae handoff cancellation.

Cr source/target action/risk/consent settings, configured audiences, canonical
source reflection, live PostgreSQL/provider checks and all-consumer cutover
remain independent unfinished gates. No package/lock/install/indirect dependency,
credential storage, startup communication, configuration or deploy changes.

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

## Bibliotheca lending caller and explicit administrator audiences

Seven existing library endpoints now use the target-owned `/api/integrations/glab`
namespace and exact actions. The previously inspected canonical Bibliotheca main075f
was stale: accepted public7b47 already contains registered book holdings and signed
Cc executive-only equipment intake. The statement that book listing/registration
was unimplemented is withdrawn. The target migration preserves those accepted
features and does not revive equipment registration over user/delegated HTTP.

| Local action | Risk | Target action |
| --- | --- | --- |
| library.equipment.read | read | equipment.list |
| library.books.read | read | inventory.books.list |
| library.items.lookup | read | items.lookup |
| library.identity.self.read | sensitive_read | identity.self.read |
| library.loans.own.read | sensitive_read | loans.own.read |
| library.loans.create | important | loans.create |
| library.books.create | important | inventory.books.create |

All source callbacks require the current admitted nonempty subject; book registration
also requires current GLAB administration. Bibliotheca independently checks its own
administrator set, derives the borrower from the consumed decision, queries own
history only, and checks current item/existing loan before insertion. Query/body
cannot select another borrower. Unknown/HEAD/direct legacy target paths are not
classified. Each target action also requires the administrator-owned matching
`delegate.bibliotheca.<action>` source policy and both services' current consent.

Corpus is pinned to public8ef005432161036e9d00d678eb9be9bda37dcaa5, with nested
Cernere71d6c368 unchanged. Both glab and glab-test now require
`CORPUS_DELEGATION_AUDIENCES`, plus the already-required project client credentials.
GLAB validates the exact same Corpus map before opening PostgreSQL stores. The map
is selected by administrators, not browser headers/body, connector transport URLs
or fetched manifest declarations. Missing/malformed/duplicate/noncanonical values
fail before startup; `{}` explicitly permits no downstream targets. Unknown keys
are denied before preparing a body or contacting authority. Cr registered hub_url
remains the final audience authority and transport still requires HTTPS or loopback
HTTP; LAN plaintext is not enabled by adding a map entry.

No live map value is populated here. Operators must verify each adopted target's
exact project key, current Cr hub_url, current consent/actions and HTTPS transport,
then supply only those entries through the service's existing injected settings.
`CORPUS_PUBLIC_URL` must also be verified against the actual GLAB registered origin;
the catalog's loopback value does not prove production readiness. Bibliotheca's
direct PWA and remaining legacy routes, other targets/consumers, canonical GLAB's
protected stale corpus checkout, runtime evidence and coordinated cutover remain
unfinished. This source change alone must not be deployed.

## GLAB presentation operations (Odeum source boundary)

The eight existing presentation endpoints now have explicit source actions and
current GLAB resource authorization. The common authority binds the exact body,
resource and one-use permit; it cannot replace local event audience, session
presenter/operator, project membership or insert-once program/project binding.
Ticket-producing POSTs are important operations even when their principal result
is a launch/view credential. Invitation GET contains guest/overlay secrets and is
a sensitive read. Unknown methods, arbitrary session suffixes and implicit HEAD
do not inherit these permissions.

| Risk | Exact actions |
| --- | --- |
| read | odeum.status.read |
| sensitive_read | odeum.live.read, odeum.ticket-keys.read, odeum.invitation.read |
| important | odeum.session.start, odeum.session.end, odeum.viewer-ticket.issue, odeum.program-ticket.issue |

All operations require the current admitted nonempty subject (or current verified
administrator according to the existing GLAB admission policy). A named direct
stream is still allowed for an admitted subject. An event stream may be started
only by its current creator/admin and must be visible to that actor. Current
event audience/roles protect viewer tickets. The actual presenter/creator/admin
may stop their stream, including after an event is removed; that exception does
not disclose invitation secrets or grant program/viewer tickets. Invitations
require a current live event session and its operator. Public-key configuration
remains administrator-only. Program producers require the session operator;
presenters require the bound project's current membership unless already an
operator. Existing insert-once binding prevents moving a live program to a new
project. The same unchanged Zod request schema is used by the resource callback
and endpoint, with 8KiB route-owned bodies and cloned reads preserving exact bytes.

PostgreSQL reads may yield. OdeumAuthorization re-reads local admission, session
status/binding and current roles afterward. Endpoints repeat those checks before
state changes or ticket issuance. Invitation QR generation is followed by another
current authorization before returning secrets; live cards project current roles,
admission and live rows after PG/relay I/O. Disconnects cannot proceed to local
session writes or ticket responses. Failures are not automatically retried.

No signing format, key, dependency or ticket lifetime is changed. Existing relay
and native tickets are separate contracts, and a ticket is not a Cr service grant
or reusable delegated operation. Relay/native session invalidation and ongoing
private viewing still require their own cutover verification; this source-only
classification does not assert that boundary complete. Existing optional Odeum
configuration and public guest participation remain unchanged. Administrator
service_operations/consent for these eight actions, actual runtime verification,
all remaining target/native consumers and coordinated cutover are still required.

## Own career-company relations

Three GLAB endpoints under `/api/x/tirocinium/career-companies` operate only on
the verified subject's existing Cr-managed `tirocinium_student_career` data.
They are separate from Tirocinium's external company directory and interview
streaming target APIs; those five operations remain unclassified here and other
owners' blocked tasks are not resolved by this unit.

| Operation | Action | Risk |
| --- | --- | --- |
| GET collection | career.companies.self.read | sensitive_read |
| PUT desired/offer/:companyId | career.companies.self.update | important |
| DELETE desired/offer/:companyId | career.companies.self.delete | important |

The shared guard requires the current admitted nonempty subject and binds the
exact path/body/request to the current service session. Relation kinds are only
desired/offer; the same existing company-ID schema is enforced and write bodies
are limited to8KiB. No query/body/role field can choose another subject. The
borrowed project client retains Cr's existing managed-project/column permissions;
neither this source action nor a project credential grants arbitrary Cr data access.
The relation reader requests only desired_companies and offer_companies, avoiding
unrelated career notes/portfolio fields. Handler responses and remote writes repeat
the current local admission, same-subject and disconnect checks after awaited body
or Cr reads. Unknown authority/write results expose stable codes without issuer
details and are never automatically retried. Existing per-company replacement,
other-relation preservation and Cr data ownership are retained.

This adds no credential format, connection, package, lifetime or native dependency.
Communications use only the existing server-configured Cr project client: on a
user operation it obtains a project token at the configured `/api/auth/login`
and sends the verified subject, the fixed managed-project key and the two
relation columns over `/ws/project`. Credentials stay in the existing client
owner; error responses omit issuer details. No client URL, audience or project
can come from browser input. Constructing these routes starts no connection,
telemetry, process or installation hook.
The existing shared client owner continues to own its WS/timers and is not closed
by the routes. Required administrator service_operations/current consent, source
reflection, actual runtime and all remaining target/native/cutover conditions are
separate unfinished acceptance criteria.

## Scoped facility/reservation callers

Seven GLAB source operations use Aedilis's published target namespace
`/api/integrations/glab`: facility list/detail (read), reservation list/own
(sensitive_read), and create/update/delete (important). Source action names are
facility.list/read and facility.reservations.list/own/create/update/delete.
Each requires the currently admitted nonempty subject. Aedilis independently
checks latest owner/audience/admin policy; a Cr capability never grants those
resource permissions by itself.

The internal reservation-capabilities request also uses the new namespace. The
booking relay checks admission and same bound session before and after awaited
capability/membership/body reads, rejects disconnect, and signs the exact outgoing
method/path/query/body. The standard delegation digest binds that signed header;
no browser-provided membership or identity assertion is forwarded. Existing Cr
organization lookup uses only the current bound subject. Old direct target paths,
missing GET reservation/:id, unknown methods and HEAD cannot mint a delegation.
The existing event client shares these fixed target paths, but the event creation,
deletion and Meet source policies remain separate unfinished work.

No credential, dependency, installation hook, startup connection or new network
destination is added. The existing explicit administrator audience map must bind
aedilis to Cr's canonical audience; transport origin is not that authority. Both
projects require current operation declarations and consent before cutover. Actual
settings, runtime, protected canonical reflection, other targets/native consumers
and coordinated deployment remain incomplete. Test execution belongs to Revisor.

## Scoped meeting-poll and GLAB handoff callers

Ten source operations are classified under `/api/x/facility/meetings`: collection
and own lists, collection creation, meeting read/update/cancellation, finalization,
response creation/update and GLAB event handoff. Every GET is sensitive_read;
mutations are important. Source action names are facility.meetings.list.read,
mine.read, create, read, update, cancel, finalize, response.create,
response.update and glab-event.finalize. The admitted nonempty subject is required;
current meeting/response ownership and audience remain Aedilis's responsibility.

The destination uses `/api/integrations/glab/meetings` and its matching target
actions. Current actor/session/admission/expiry checks are repeated around
membership awaits and before signing the actual request. DELETE retains its exact
revision body. The existing handoff cancellation helper also uses the target's
glab-event/cancel action, but this does not classify the still-unfinished source
event-deletion operation by itself. Old direct meeting paths, session/guest
operations, response deletion, unknown methods and implicit HEAD cannot delegate.

The event-import handler accepts only the verified subject's matching meeting and
slot snapshot with consistent facility/reservation linkage. It repeats current
GLAB actor checks after Ae finalization and each awaited store read, immediately
before local facility promotion/event import and before returning data. A changed
actor, expired session, disconnect or revoked admission stops subsequent work.
There is no distributed transaction across Ae, SQLite admission and GLAB's
PostgreSQL stores; permission is checked synchronously before each write dispatch.
An unknown local result is never automatically re-executed. Existing import by
meeting ID and target handoff idempotency support a new explicitly authorized
manual request, not proof reuse or an authorization fallback.

Stores/DB/SDK remain borrowed from their existing owners. No dependency,
connection, startup traffic, credential format or custom signature is added.
Cr operation declarations/current consent, explicit administrator audiences,
protected canonical source reflection, runtime verification, other targets/native
consumers and coordinated cutover remain separate unfinished conditions.
