# Tirocinium browser voice call

GLab students explicitly start a microphone call in the existing company panel.
This careers-domain entry is independent of Odeum broadcasts. Tirocinium owns
admission, interview progress, STT/TTS and evaluation; GLab transports transient
audio/control only and stores no recordings or transcripts.

Authenticated `/api/x/tirocinium/calls` HTTP routes use the existing Cernere
downstream token provider (`projectKey=tirocinium`). Create uses Tr session API
then its owner-only 30-second single-use call ticket. GLab consumes the ticket in
the first upstream WS frame. Browser never sees bearer/ticket or a Tr URL.
Browser fetch SSE carries Tr frames; sequential bounded POST batches carry PCM
and controls. There is no SSE reconnection. Every route checks the current user
against the memory-only call owner. DELETE, stream abort, setup timeout, upstream
failure, browser navigation and page exit release the call and its Tr slot.

Configuration: only the existing Excubitor `TIROCINIUM_URL`, with Cernere Tr
audience matching this registered URL. No new public WSS, TURN or Corpus changes.
Browser microphone needs HTTPS except loopback. Tr TTS/STT providers must be
configured through existing Tr setup; do not silently substitute another backend.

Acceptance plan: owner isolation; expired/replayed ticket; denied microphone;
create/ticket/upstream/stream failure cleanup; no stream attachment timeout;
bounded/ordered audio posting; mute/barge-in/end; navigation cleanup; independent
Odeum use. Tests/service starts have not been authorized and are not run.
