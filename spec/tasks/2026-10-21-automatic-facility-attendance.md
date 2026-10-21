---
task: Automatic facility LAN attendance
project: glab
kind: feature
created: 2026-10-21
memory_links: []
---

# Request

Opening the attendance tab must check the user's related facilities through Ostiarius and automatically record verified attendance. Each facility LAN check has a three-second deadline; timeout is treated as outside that facility's LAN for attendance eligibility.

# Design constraints

- The browser must contact each configured facility gateway directly. Server-to-server reachability does not prove the user's physical LAN presence.
- A health response alone must never create attendance. Bind a short-lived gateway-signed proof to the authenticated user, facility, request nonce and expiry; validate it in GLab before writing.
- Query trusted facility/gateway mappings, never client-supplied arbitrary URLs or public keys. Verify the proof's facility matches the registered gateway and selected target.
- Check facilities concurrently with bounded concurrency. An unavailable facility must not block successful independent checks. Cancel pending requests when the view is disposed; ignore late results after the deadline.
- Reuse the existing user/date/facility uniqueness and replay protection. Refreshing or reopening the tab must not create duplicate attendance.
- Preserve authentication failures separately from LAN timeout, and do not classify an attendance-save timeout as outside LAN.
- Show checking, outside LAN, recorded/already recorded, and verification/save failure per facility.
- Preserve manual alternatives; do not require an interactive passkey prompt for automatic attendance or claim ping alone authenticates the user.

# Existing implementation evidence

- `plugins/attendance/local-ostiarius.ts`: browser health request already has a 3,000 ms abort deadline.
- `plugins/attendance/panel.ts`: current flow uses one gateway and manual passkey interaction; automatic multi-facility attendance is not implemented.
- `plugins/attendance/index.ts`: checks authenticated subject, signature freshness and nonce, then records attendance independently of an event. Existing event association must be constrained to the matching facility when adding multi-facility attendance.
- `plugins/attendance/gateway-register.ts`: current startup registration fetches one gateway key.
- `plugins/facility/booking-proxy.ts` and `groups.ts`: existing organization/team membership resolution.
- Ostiarius `server/routes/cocoiru-checkin.ts`: existing session proof route requires direct same-LAN connection and a Cernere bearer token. Browser credential delivery and allowed origins need an explicit contract; do not expose a long-lived token to multiple gateways.

# Confirmed scope

The requester selected the user's organization facilities. Facility arrival must not confirm event attendance: each event occurrence requires the organizer's explicit OK. Show that event's related Odeum session and retain existing viewing/presenting permissions. Record these specifications in Praeforma; new specifications are drafts until review/verification.

Praeforma project `01M1ZACJ5YK6G5NEFWX8Z4P6G4`: GLAB-FACILITY-AUTO-001 (`01M5EZH9Z7GJDGQGX74W9HX8GH`), GLAB-EVENT-ATTENDANCE-001 (`01M5EZH9ZH111BZ67MJNBFTWXD`), GLAB-EVENT-ODEUM-001 (`01M5EZH9ZTJHQN0WJ5TZ1G1GRD`).

# Acceptance checks

1. Tab opening triggers checks without a second attendance button click.
2. Each unreachable facility finishes as outside LAN after three seconds; a reachable facility can still succeed.
3. A successful health response without valid user-bound proof never records attendance.
4. Wrong facility, wrong user, expired/replayed proof and untrusted gateway are rejected.
5. Duplicate opening/refresh writes at most one attendance per user/date/facility.
6. View disposal and deadline expiry cannot apply late success to the UI or start a new attendance submission.
7. LAN timeout and authentication/save failures remain distinct.

# Investigation

Anatomia `plan --project glab --task ... --no-llm` returned attendance, platform-shell and facility-reservation domains. It warned that an unrelated trend-view domain definition could not be parsed. TypeScript language server is not available on PATH; no LSP verification or runtime test has been performed for this change.
