# Automatic facility arrival and event attendance

## Facility arrival

Private gateways can additionally specify `allowedUserIds` with exact Cernere user IDs. Both target discovery and proof submission require organization membership AND a listed user; administrators have no bypass. Omission preserves organization-wide eligibility, an empty array denies all users, and malformed values reject startup configuration. Do not expose this list in browser target responses. This restricts attendance eligibility, not physical door access.

Opening attendance runs browser-to-Os POST checks for gateways in the authenticated user's organizations. Each gateway has a three-second connection/body deadline, with at most eight concurrent requests. A timeout is treated as outside LAN for eligibility. It does not prove physical absence. Authentication errors and failure to save a verified proof remain distinct from LAN timeout.

GLab issues a 60-second attendance-only HMAC capability binding user, facility, LAN gateway and a unique nonce. Os checks the actual connection against its enrolled interface and returns an Ed25519 proof. GLab rechecks current membership, gateway/facility binding, subject, signature, freshness and nonce before writing the existing unique user/date/facility ledger. No general user access token is sent to facility gateways. Reopening the tab is idempotent at the ledger.

Configure `GLAB_ATTENDANCE_GATEWAYS` in Excubitor Vault as a JSON array of `{ organizationId, facilityId, name, lanId, url, publicKeyPem, challengeSecret }`. Organization and facility IDs must refer to existing authoritative records; this configuration binds gateways and does not create a parallel organization/facility master. URL must be a bare HTTPS origin; public key must be Ed25519. Secret must be a random value of at least 32 characters shared only with the corresponding Os deployment. Duplicate LAN IDs fail configuration validation. Missing configuration shows an explicit unconfigured message. Never put real secrets in this repository.

Os additionally requires `OSTIARIUS_GLAB_ATTENDANCE_SECRET`, exact `OSTIARIUS_GLAB_ORIGIN`, its enrolled LAN interface and TLS. Runtime enrollment is separate from code merging.

## Event attendance

Facility arrival no longer associates an active event automatically. A participant requests event attendance, and the event creator (the current organizer field) approves it using OK. Admin role alone cannot approve another organizer's event. SQLite `glab_event_attendance_approval` is keyed by event ID, occurrence start and user ID; only a non-null approved timestamp confirms event attendance. Legacy facility-ledger event links are preserved as historical data, not migrated into approvals. The attendance tab shows visible events from the preceding day to the following day; requests cannot precede event start.

## Odeum

Event cards reuse existing event-ID-scoped live sessions, authorization, presentation controls and embedded viewing. Watching does not approve attendance. Viewer resources are disposed on leaving the view or page. No automatically launched audio/video is required by this flow.

## Acceptance

- Unrelated organizations never receive targets or proof-based writes.
- Each LAN request times out in three seconds; rejected authentication is not a timeout.
- Wrong user/facility/purpose, old proof and replay cannot write arrival.
- A facility arrival cannot approve event attendance; only the organizer can approve the requested occurrence.
- Refreshing cannot duplicate arrival or event approval.
- Only the selected event's Odeum sessions are displayed.

Praeforma specifications: GLAB-FACILITY-AUTO-001, GLAB-EVENT-ATTENDANCE-001, GLAB-EVENT-ODEUM-001 (project `01M1ZACJ5YK6G5NEFWX8Z4P6G4`).
