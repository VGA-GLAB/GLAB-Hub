# GLab membership approval

## SPEC-GLAB-ADMISSION-001

Cr authentication establishes identity, not GLab eligibility. GLab owns a separate
pending/approved/rejected record keyed only by the verified Cr service subject.
Only existing authenticated administrators may decide eligibility. Decisions
record actor/time and compare revisions to prevent lost concurrent updates.
Existing administrators retain access; other existing users require approval.

The host policy executes after Corpus authentication, before API/MCP handlers.
Pending and rejected users receive a status-only frontend rather than the member
shell. Their API access is limited to their own identity/admission and sanitized
connector titles/statuses. Member modules, service data, relay and MCP remain
unavailable even if called directly. Every request rechecks eligibility, including
after revocation. Service principals retain existing external-module and scope
checks; they do not become human administrators.

## SPEC-GLAB-ADMISSION-002

Cr registration hooks durably populate project registration rows. A scope-checked
bot endpoint consumes the authenticated GLab project's registration feed, one
bounded page per scheduler tick, with a persisted cursor and idempotent insertion.
A completed pass restarts to catch UUIDs inserted before the previous cursor.
Only GLab-scoped registrations are imported. Historical registrations require
approval but do not generate a rollout mention burst. Names are fetched from Cr
for administrator display and are not duplicated in GLab storage.

Discord notifications use the configured channel and a verified individual user
ID, with allowedMentions restricted to that user. The notification links to the
public GLab URL, not the bot's internal API endpoint. Persist pending -> sending
before sending and store the Discord message ID on success. An uncertain delivery
remains sending for inspection; never automatically retry it. Approval does not
depend on notification delivery. No tokens or registration personal data appear
in Discord messages.

Deployment requires the merged Corpus host-access-policy hook, Cr's project-scoped
list_registrations action, the access external-module allowlist, and bot public
URL/channel/mention configuration. Runtime validation and real notification
delivery are separate from compilation and must be recorded after deployment.
