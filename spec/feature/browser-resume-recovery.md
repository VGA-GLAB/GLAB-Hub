# SPEC-GLAB-RESUME-001: authenticated shell recovery

User requests retained-page reload recovery across LUDIARS. GLab owns its shell and must explicitly install Corpus's reviewed recovery adapter.

After authenticated shell rendering and HMR initialization, install `installHubResumeRecovery(app, isHmrConnectionStale)`. Dispose it through the existing shell cleanup invoked by showLogin/logout. Login and passkey handoff do not install recovery listeners.

The adapter reloads a restored history-cache document or a page returning after 60 seconds hidden; a disconnected HMR stream also triggers recovery on short return. It waits until online/visible and coalesces repeated events. Edited fields and in-flight submissions prevent automatic reload and show an explicit refresh notice with discard confirmation.

Corpus pointer advances from 16a430f to reviewed merge 13dbf0015909 (PR 3201). The diff contains only the lifecycle adapter, shell integration, tests and specification; no backend/environment/auth SDK changes.

Acceptance: known Corpus lifecycle/draft tests; GLab stream-health check and shell wiring; browser build. Real browser resume and production reflection must be reported separately.
