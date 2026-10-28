# SPEC-GLAB-PUBLIC-LEGAL-001

Authority: neco requested privacy/terms at the GLab site entrance, anonymous
external access to both, and specifically static HTML response endpoints.

GLab composes its existing public quest router with two fixed GET routes under
Corpus's `/public` read-only boundary. No Corpus submodule or authenticated API
policy is changed. Only `/public/legal/privacy` and `/public/legal/terms` serve
operator-authored HTML. HEAD uses the framework's GET response semantics; other
methods are rejected by the existing public boundary. Unknown paths remain 404.
Queries never select a file or alter the response. Missing approved files return
503; other I/O failures propagate as server errors. No new package or install
script, templating engine, authentication implementation or remote fetch is added.

The entry HTML places links before the app mount, so they remain visible during
loading and login errors and do not depend on a successful authentication-config
request. This is an information notice, not an invented consent/acceptance record.

Deployment acceptance: document copy is included following neco's instruction to
use conventional wording (2026-10-28). Verify both
exact URLs from outside without a session and confirm normal protected APIs still
require login. Where Cloudflare Access covers the hostname (glab-test), an exact
path-scoped public policy/routing configuration is also necessary; do not disable
Access for the site, `/public/*`, quests, or APIs. Existing ALLOW ME policy remains
for the rest of the test site. Edge configuration is not changed by this commit.

Investigation: current Corpus `installPublicReadRoutes` precedes `/api/*` auth and
host access policy; GLab already uses that hook for public quests. Anatomia project
list reports glab, but plan resolution rejected both glab and GLAB as unknown;
no plan output is claimed. Praeforma project endpoint responded, but no matching
legal-document specification was established. Task linkage confirmed:
actio:f3bbafaf-7856-4f72-b1a1-769dd11183df (open/current).

Pending: build/review, deployment and anonymous external verification.
The documents use no scripts or remote assets and make no fixed retention-period,
legal-entity identity, blanket liability waiver, or analytics-absence claim.
Editorial references: https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
and https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/assets/consumer_system_cms203_230915_12.pdf
These references informed topic selection; this is not a claim of legal certification.
