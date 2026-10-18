# Headquarters Di published conclusions

SPEC-GLAB-DI-PUBLICATION-01. neco approved 2026-10-18「この設計で開始」.
Actio: 083819eb-e776-46a9-93d6-b0fd3fad05cb. Di counterpart: a6669b81-6100-40a3-9c08-f2c010dd40d4.

GLAB's Di panel shows conclusions from headquarters Di. The upstream `DISCUTERE_URL` must target headquarters Di over HTTPS or same-host loopback HTTP. Inject `DISCUTERE_GLAB_CONCLUSIONS_TOKEN` through Excubitor Vault in both services (at least 32 characters); absent credentials produce an explicit unavailable response, never anonymous fallback. No credentials go into frontend bundles, responses or repository files.

Authenticated GLAB users call `/conclusions[?id=...]`. Di enforces `publishable=true AND scope IN ('public','glab')`; GLAB rejects unknown scopes and projects only id/title/conclusion/updatedAt/scope. The existing general learning-page link is replaced by this constrained view. Discussion launch remains unchanged.

Both list and detail are no-store. Opening a conclusion makes a fresh request so a withdrawn publication returns 404. Backgrounding clears displayed results, and update clears old results before fetching. Results are text nodes, not interpreted HTML. Upstream failures do not leave a cached successful view. Already-read content cannot be recalled from a user; no real-time revocation push is claimed.

Acceptance: login gate, public/glab allowlist, private/unknown rejection, credential isolation, TLS/loopback transport, withdrawal reflected on fresh detail read, and a visible unavailable state. Static typecheck/build are separate from unexecuted runtime validation. Configuration and restart are operational steps, not implied by code compilation.
