---
task: Support personal facility attendance without organization membership
project: glab
kind: feature
created: 2026-10-22
memory_links: []
---

# Requirement

The requester designated their test facility as personal and identified their account by public profile. The authoritative account has no organization memberships. Do not invent an organization or use email as identity.

# Design and acceptance

Add an explicit ownerUserId alternative to organizationId in trusted gateway configuration. Exactly one ownership mode is required. Personal gateways allow only that exact authenticated user, with no administrator or group bypass. Apply the same policy in discovery and proof submission. Reject conflicting allowlists and malformed owner IDs. Preserve existing organization gateway behavior. Test owner/no-membership success, non-owner denial and invalid configurations. Runtime enrollment and real-device attendance remain separate from code review.
