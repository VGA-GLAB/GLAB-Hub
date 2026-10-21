---
task: Restrict private facility attendance to designated users
project: glab
kind: feature
created: 2026-10-22
memory_links: []
---

# Request and design

The requester designated the test facility as private to their own account. Add optional `allowedUserIds` to trusted gateway configuration. It intersects organization membership, never replaces it. Both target discovery and proof submission apply the same restriction using the authenticated Cernere user ID. No administrator bypass; no client-provided IDs. Empty lists deny all; malformed lists reject configuration. Existing gateways without the field preserve organization-wide access.

# Acceptance

- The designated member can discover the gateway and submit a valid proof.
- Other members, administrators not listed, and users outside the organization are excluded.
- Removing a user also denies submission of previously issued proofs.
- Configuration and tests contain no real account IDs or secrets.

# Runtime prerequisites

Resolve the requester's authoritative Cernere identity and the existing organization/facility record before activating the private gateway. Facility attendance restrictions do not implement physical door control or replace the facility master's access policy. Do not enable organization-wide access as a temporary workaround.
