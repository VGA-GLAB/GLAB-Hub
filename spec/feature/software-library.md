# SPEC-GLAB-SOFTWARE-LIBRARY-001

neco requested a library-acquisition entry in GLab on 2026-10-28, during the
Cocoiru native GLab client/Synergos/Odeum work. The same day's subsequent request
restricts Web to browsing and moves downloads to signed Cocoiru delivery.
This is a software distribution
catalog, separate from Bibliotheca's existing `library` book/equipment module.

## User flow

Signed-in, admitted GLab users open **ライブラリ取得** from the workspace menu or
use `/#software-library` (login/admission still apply). Search by name/use and
filter runtime/plugin/SDK and Windows/macOS/Linux/common. Each published card
shows purpose, version, platform and license. The panel has no acquisition link,
download/install action or administrative editing form, including for admins.
The UI explicitly reports that signed Cocoiru delivery is still in preparation.

Separately authorized admin APIs retain draft metadata and withdrawal support;
they are not browser download APIs. A published catalog record is NOT evidence
of a signed artifact or permission to deliver one. Legacy distribution URL
metadata is kept server-side for migration and is not returned by `/entries`.
Initial catalog is empty; no imaginary release artifact/SDK is fabricated.
Actual Cocoiru bundles and dependency artifacts must be supplied separately by
their owner after build/review/license checks. This UI is not evidence that the
blocked Cocoiru native build has become usable.

## Boundary and storage

Module `software-library`: GET `/entries` (published metadata projection only), GET `/manage`
(admin, includes drafts), PUT `/entries/:id` (admin). Ordinary user tokens are
required in addition to Corpus's outer authentication; service principals cannot
list or write. GLab admission remains the existing outer access policy.
`glab_software_library` is defined idempotently in shared `plugins/data.ts`;
metadata contains no personal records, access credentials or binary content.

Writes require application/json, strict schema, 16 KiB bounded UTF-8 body,
slug ID, bounded strings, enumerated kind/platform and optional 64-hex SHA-256.
Catalog size is bounded at 200 entries. Public URLs must be HTTPS and have no
userinfo, query, fragment, whitespace or backslash. Do not register signed links
or private credential-bearing distribution paths. GLab never fetches, proxies,
scans or probes those URLs, including startup. A registry entry does not assert
third-party artifact safety or that the publisher's optional hash was independently
verified. Dynamic text uses DOM textContent. The projection enumerates permitted
fields, preventing future private storage fields from leaking by default.

Existing zod, Corpus SDK, panel-kit and bounded-body implementation are reused;
no dependency, runtime command or installation script is added. No Discord
operation, external upload or running-service restart is part of this change.

## Acceptance

- Menu registration, panel bundle registration and direct-link navigation.
- Ordinary user sees only published entries; anonymous/service identity rejected;
  non-admin cannot manage/write; admins browsing receive the same safe projection.
- Reject malformed UTF-8/JSON, oversized chunked body, unknown fields, bad enum,
  invalid ID/hash and unsafe URL; publication requires complete metadata.
- Empty/error/loading and no-filter-match states are distinct; common-platform
  entries appear with each OS. No web editing/navigation/download/installation.
- Schema can be applied repeatedly without overwriting catalog records.

Validation: static compilation/build checks are recorded separately from test
execution and live confirmation. Tests/services remain subject to existing
explicit authorization. No distribution items have been published by the agent.

Evidence: GLab baseline 508d2c6; existing library, showcase download, module pack,
shell and bounded-body sources inspected. Anatomia context `glab-hub` consulted;
index/cache warnings and unrelated prior clauses do not prove this new feature.
Praeforma project endpoint was reachable but its response has not yet established
a corresponding library-acquisition specification; this file is the new scope.

## Validation record

The new backend/panel entrypoints and changed shell passed TypeScript checks;
all three passed esbuild bundling with package imports external. The isolated
checkout has no populated Corpus submodule, so these static checks used a
read-only resolver to the already installed GLAB/Corpus source and dependency
trees. No submodule contents or dependency manifests were modified, and no
install/build scripts from newly downloaded code were executed. This is not a
full production-package build or live UI verification. Existing external-import
policy blocked a compound command containing `git submodule status`; that
operation was not retried or bypassed.

New route cases cover user/admin separation, draft isolation, publication,
withdrawal, malformed/oversized bodies and unsafe URLs. They were written but
not executed in this session. Revisor remains the registered-test review path.
The preceding validation record describes PR #3507, now merged as ba4174ac8fe4.
No service was started/restarted, no distribution entry was published, and no
external artifact was downloaded. Cocoiru PR #3505's separate SDK prerequisites
and native verification remain open.

## Secure distribution revision

See `cocoiru-secure-distribution.md` for the native identity prerequisite, proposed
certificate/key lifecycle and acceptance conditions. Crypto/authentication is
not implemented through a home-grown substitute. This change adds no dependency
or install script, changes no lockfile, and removes the now-unused management UI.
Network behavior is limited to the existing authenticated same-origin catalog
read. External navigation was removed. No startup network activity was added.
