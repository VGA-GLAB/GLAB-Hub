# Odeum direct streaming with optional event

## Instruction and acceptance

Actio: `f54e8573-bb83-4a89-8fb0-31376d6bff06`.
neco requested replacing 発表 with 配信, adding 「このPCで配信を始める」,
then explicitly selected eventless start with optional event selection.

- GLab's authenticated Odeum panel offers an optional event selector. Candidates
  use the existing audience-filtered events API and are limited to events the
  actor created or can administer. The server rechecks ownership and visibility.
- No selection requires a trimmed stream title of 1–120 characters. Selecting an
  event uses its title and the existing single-live-session-per-event contract.
- Native `odeum://present` launches the installed local Odeum application. An
  explicit fallback link expires with the ticket; the UI explains installation
  and protocol association requirements without claiming to detect installation.
- Live means an open ledger session, not evidence of media transmission. Relay
  connection state remains connected/waiting/unknown. Only connected says 配信中.
- Eventless streams require GLab's existing authenticated plugin route. No guest
  invitation claim is issued for them. End permission is presenter or administrator.

## Storage and compatibility

The existing event-session table has a NOT NULL event reference and a program
foreign key. An additive `glab_odeum_direct_sessions` table preserves that schema
and all existing rows without synthetic events or destructive migration. Queries
combine both ledgers; eventless sessions expose `eventId: null` and a title.
A partial unique index limits eventless streams to one live session per presenter,
so repeated requests reopen the same session. Ended sessions never resume.

Event-linked program creation and invitation behavior are unchanged. Eventless
program production is not added by this direct-presenter request and returns an
explicit event-required error. This change does not implement remote input,
Discord notifications, relay deployment, or external WebSocket routing.

## Verification

Static TypeScript checks and build are required. Regression cases cover additive
schema initialization with existing event rows, eventless retry/end lifecycle,
invalid/mixed start payloads, card visibility and unknown relay state. Runtime
tests are delegated to Revisor; no local service start or runtime test is implied.
