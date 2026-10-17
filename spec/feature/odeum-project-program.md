# Project-associated Odeum programs

neco request, 2026-10-17: preserve Custos, create Odeum source selection, network composition,
Project GLab association, background recording and later archive distribution.

The event controls now offer “合成番組を準備”, which creates the existing presentation ledger
without launching a direct presenter in the program slot. The operator selects a GLab project
and obtains a producer link; members select input1..4 and obtain presenter links.

`POST /api/x/odeum/sessions` accepts optional `mode: "program"`. Existing calls remain compatible.
`POST /api/x/odeum/sessions/:id/program-ticket` accepts:

- `{role:"producer",projectId}`: event/session operator only. Binds the live session to a real GLab
  project once; another project is a 409 conflict. Returns `odeum://produce?...&projectId=...`.
- `{role:"presenter",slot:"input1".."input4"}`: event must be visible and actor must be an operator
  or a member of the bound project. Returns `odeum://present?...&projectId=...`.

Binding table `glab_odeum_programs` is initialized idempotently in plugins/data.ts. The existing
session lifecycle and event permissions remain authoritative. Native project context is local
archive organization, not an authorization credential. Tickets remain short-lived Ed25519 tokens;
producer role and presenter slot are checked by Odeum relay. No signing keys or tickets are logged.
The relay enforces one active publisher per input and one producer per room.

Odeum native change is required for project context, partial capture, recording and archive replay.
This change does not publish recordings or start a service. Archive files remain on the production
machine and are later rebroadcast through Odeum; browser VOD storage is outside this implementation.

“Project GLab” has provisionally been interpreted as project association; a visual frame needs the
requester's clarification. No graphical brand assets have been invented.

## Validation

`npm run typecheck` and `npm run build` passed on Windows on 2026-10-17.
The producer link is copied into the native program's link input: the existing OS URL
registration launches the presenter and cannot dispatch producer links.
No unit, integration, browser or service startup tests were run. Runtime permissions,
concurrent project binding and end-to-end capture/recording remain unverified.
