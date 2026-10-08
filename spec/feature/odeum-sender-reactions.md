# Smartphone sender-selected reactions

Task: actio:af82f06f-582b-4512-8afb-34135ad5dc8c.
User neco selected sender-controlled visibility on 2026-10-08.
Protocol dependency: Odeum `spec/feature/sender-reactions.md`, local PR 2563.

- Separate short telops (60 Unicode scalars) from questions/impressions (280).
- Questions/impressions default to private. A checkbox explicitly permits name and
  text to appear on participants' screens; consent resets after each submission.
- Private means the presenter's inbox only. The viewer parser rejects private or
  missing/ambiguous visibility even if an erroneous server forwards such a message.
- New text inputs require `presence.presenter_connected === true` and
  `presence.reaction_version === 1`. Never fall back to legacy public comments.
- New socket sends return failure when unavailable, preserving the current input.
  Text validation never truncates silently. The relay remains the rate-limit owner.
- Telops occupy a transparent, noninteractive layer over the video, at most three
  for five seconds. Public questions occupy at most two entries for eight seconds.
  Good/stamp particles are capped at 20 for two seconds. Eviction and teardown
  release timers. Reduced-motion settings disable movement.
- All user text uses textContent; no user HTML is evaluated. Effects have no media
  controls and never pause/seek video. Sound control remains above the effects.

This is the existing authenticated GLAB/WebRTC viewer. It does not yet provide an
OBS browser source, Cocoiru SRT reaction composition, or anonymous LAN phone entry.
Those are outstanding integration work; native viewer code is not evidence of a
successful GROMAC LAN test.

Verification: protocol tests cover privacy and malformed text, but were not executed
by this session. Static type/bundle checks are separate from live phone validation.
