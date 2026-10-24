# Odeum browser screen broadcasting

Request: neco, 2026-10-24: connect Odeum to GLab; 配信開始 sends the operator's PC screen over WebRTC + TURN.

## Behavior and boundaries

- The operator clicks 配信開始 in the live-stream panel (optional authorized event, otherwise a stream title) or in an owned/admin event. `getDisplayMedia` runs directly in that gesture before any API await. The browser/OS picker remains mandatory. Cancellation creates no session.
- GLab's existing authenticated session endpoint issues the same presenter ticket, now also returning `wsUrl` and `ticket` for browser signaling. `presentUrl` is retained for native clients. Event visibility, ownership and ticket expiration rules are unchanged.
- A persistent page-level control shows preparation, connected, stopped or failed. It remains available across panel navigation and prevents duplicate starts in that page. Connected means the WebRTC peer reports connected, not merely that a session row exists.
- The presenter requires relay-supplied authenticated TURN servers and uses `iceTransportPolicy: relay`. Missing TURN, unsupported H.264 baseline/Opus, denied capture and connection failure stop capture with an explicit message. No credential is hardcoded or persisted.
- H.264 constrained baseline, packetization-mode 1, one video SSRC and optional Opus match Odeum's forwarding relay. RTX and unsupported codecs are excluded. Audio availability follows the chosen browser/OS source; absence is shown.
- Stop, browser share-stop, pagehide and transport failure close the socket/peer and all capture tracks. A late picker/session response after cancellation cannot restart transmission. Failed resume does not end another connected presenter. Closing the tab stops media immediately; ledger cleanup is best effort during unload, so stale entries can still be ended from the event screen.
- Viewer signaling answers relay-originated offers (including source switches), queues early ICE and serializes asynchronous messages. Audio and video share one MediaStream even when native relay SDP has no msid.
- This does not provision a TURN server, modify Odeum's native code, restart services, or publish a screen automatically.

## Evidence

- Original GLAB base `1b353b5`; conflict resolution rebased the task commit onto Revisor's integrated GLAB base `75e2d08`. Preserved standalone stream selection, program preparation and program controls; both start entry points now use browser capture. Shared local main was not changed. Odeum reference `ccaddbe`, especially `native/relay/media.cpp` and `media_sdp.cpp`.
- Praeforma GLAB project `01M1ZACJ5YK6G5NEFWX8Z4P6G4`: `/ux-design/scenarios` returned no scenarios. Existing local spec `odeum-live-presentation.md` and design `2026-10-04-odeum-live-presentation-design.md` supply the ticket/media contract.
- Anatomia `context --project glab-hub` identified that design's ticket/media clauses and `odeum-viewer` domain. Index fallback/EPERM cache warnings occurred; relevant source was inspected directly.
- [W3C Screen Capture](https://www.w3.org/TR/screen-capture/) defines user activation and source selection; [W3C WebRTC](https://www.w3.org/TR/webrtc/) defines codec preferences and relay ICE policy.

## Validation and acceptance

Typecheck and application build completed. Added codec/TURN regression cases for the review runner; session did not run tests under the current workflow policy.

Acceptance still requires a deployed HTTPS GLab, reachable authenticated relay, and valid `ODEUM_RELAY_ICE_SERVERS` in the relay's runtime configuration. Verify picker cancellation; same-user second-tab rejection without ending the first; delayed API cancellation; missing/invalid TURN; relay-only selected candidate; screen plus optional audio on another GLab client; viewer source-switch renegotiation; stop and transport-loss cleanup. Browser/OS capture and actual TURN media delivery remain unverified.
