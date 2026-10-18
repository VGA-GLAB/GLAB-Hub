# SPEC-GLAB-POLL-EVENT-01

Approved by neco on 2026-10-18: answers alone are login-free in Ae; finalize as a GLAB
event; check attendance on the day; absence also requires login; 「この内容で開始」.

GLAB organizers create public polls with guestResponses enabled and share Ae's existing
canonical URL. Public poll finalization now calls the signed Ae handoff endpoint, then
imports one GLAB event per meeting ID. Existing facility reservations are reused. The
GLAB PostgreSQL store serializes import with a unique meeting mapping; the mapping survives
event deletion. No caller-provided owner or reservation ID is accepted. Private/internal
polls retain their previous local finalization and cannot widen into GLAB events.

An incomplete import is visible and can be retried from the finalized candidate. The
immutable Ae snapshot prevents changed dates between services. Handed-off polls cannot
be reopened independently. Event deletion first calls Ae's idempotent signed cancellation;
force deletion is unavailable for these events. Recreating a deleted imported event is rejected.

Event attendance uses authenticated GLAB routes. Actual check-ins come from glab_attendance
for that event and JST date. Absence is an explicit report by the logged-in user, stored in
glab_event_absence in the shared SQLite schema (plugins/data.ts); no display-name identity
inference, absence-by-silence, or new unverified check-in route. A verified check-in takes
precedence over a prior absence. Attendance viewers must have access to the event and see
names only, not user IDs or photos. Absence changes stop after the event ends.

The event and immutable import mapping remain in the existing PostgreSQL EventStore,
shared with the notification Bot. No changes to Corpus or Cernere are included.
Requires Ae SPEC-AE-GLAB-HANDOFF-01 before use; no fallback to duplicate reservation creation.
