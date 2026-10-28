# SPEC-GLAB-COCOIRU-DISTRIBUTION-001

## Request and implementation boundary

**Superseded design decision, 2026-10-28:** neco selected download access for
logged-in users, without device enrollment. Implementation and operational
limits are now specified by `library-delivery-v1.md`. The proposal below is
retained as design history; its native-attestation, grant and load-time items
are not claims about the implemented download-only feature.

neco, 2026-10-28: Web is browsing-only; Cocoiru downloads libraries. GLab
provides certificates and signs plugins. Login should securely deliver the
material needed for decryption. Existing reflection/test authorization remains
valid, but does not provision a production CA or expand changes into Cernere.

This revision implements only the read-only browser boundary. Native download,
certificate provisioning, signing, encryption, key grants, and native load-time
verification are NOT implemented or certified by the catalog UI. No artifact
is published, secret generated, or download capability enabled in this revision.

## Evidence and unresolved authentication boundary

Inspected GLAB `corpus/server/auth.ts`: AuthIdentity exposes user identity and
roles, but not a verified native client identity or device-key confirmation.
Inspected Cernere `packages/native-composite/src/client.ts`: Cocoiru's broker
uses ordinary Bearer authorization via `authorized()` after exchange/refresh.
Cocoiru's native plugin loader currently calls LoadLibraryExW for manifest-listed
DLLs without signature verification. A manifest allowlist is not a signature.

Neither User-Agent, a custom Cocoiru header, hidden endpoint, CORS, nor possession
of a browser-accessible bearer token proves that a caller is Cocoiru. Browser
JavaScript can also create key pairs. Proof-of-possession binds a credential to
a key; it does not independently attest the application that generated the key.
Do not enable native-only grants by adding any of these superficial checks.

**Decision needed before native distribution:** whether native-only means an
approved/enrolled device with a server-verified key binding (recommended), or
only a dedicated user interface while any authenticated member can use the
download API. The latter must not be described as cryptographic Cocoiru-only
access. Enrollment/bootstrap authority must be agreed before extending Cernere
or adding a GLab-owned device approval flow.

## Proposed security contract (pending authentication decision)

1. GLab owns a plugin signing certificate and private signing key. Private keys
   stay in the service's secret provider / non-exportable key store; never in
   source, catalog, logs, browser responses or Cocoiru. Separate signing from
   delivery; normal downloads must not sign caller-supplied content.
2. A release manifest covers plugin ID, monotonically increasing release number,
   version, target OS/architecture, Cocoiru ABI, every executable dependency,
   exact file size and SHA-256. Use an established signed format and crypto
   implementation. No custom crypto primitives or unreviewed dependency import.
3. Cocoiru receives its GLab trust anchor through a trusted installer/update,
   not by trusting a certificate bundled with the downloaded plugin. Verify
   signer chain/purpose, expiry and revocation, the signed manifest, and all
   payload bytes before installation AND before DLL loading. Reject unsigned,
   altered, unknown-signer, revoked, incompatible and rollback packages.
4. Hashes identify keys/content and check integrity; a public hash is not a
   decryption secret. Encrypt payload with authenticated encryption (for example
   AES-256-GCM through an established library), using fresh random content keys
   and nonces. Authenticate identity/version/ABI metadata with the ciphertext.
5. On authenticated native login, bind a short-lived grant to user, approved
   device key, session, audience and intended permission. At download time,
   recheck admission, grant expiry, device revocation and artifact publication.
   Wrap the content key to the approved device public key. Do not send a shared
   permanent decryption key or private signing key at login.
6. Reject replay using server challenges/nonces and one-use request identifiers.
   Logout/account switch cancels pending transfers and discards grants/plaintext
   keys; session expiration or revocation prevents new key issuance. Already
   decrypted copies cannot be retroactively made secret or deleted remotely.
7. Native transfer uses HTTPS with verified server identity; enforce size/time
   limits, no arbitrary URL redirects, fixed artifact roots, no traversal,
   symlinks or archive link entries. Stage privately, verify, then atomically
   install. Download never implies automatic execution. A malicious executable
   running as the user is outside the secrecy guarantees of this mechanism.
8. Browser `/entries` is an allowlisted metadata projection, without download
   locations, certificates, grants or keys. Admin storage APIs remain separately
   authorized operations; the Web panel provides neither editing nor downloads.

## Acceptance before enabling distribution

- Authenticated Web requests cannot mint native grants under the strict model;
  fake headers and a fresh unapproved key do not bypass enrollment.
- Unauthenticated, expired, wrong-user/device, revoked and replayed requests fail.
- Signing trust is independent of artifact transport; rotation/revocation and
  offline behavior are specified and exercised without insecure fallback.
- Corrupted/truncated payload, swapped metadata/dependency, unknown certificate,
  rollback, invalid ABI and path traversal all fail before loading any code.
- Logout during transfer cannot commit a download for the old account.
- No key/token leakage in APIs, exception messages, disk caches or telemetry.
- Reviewed dependencies/license/transitive install scripts and network behavior
  are recorded before introducing a signing or encryption dependency.

## Investigation

Anatomia `plan --project glab-hub --no-llm` identified software-library and
identity-access; cache EPERM, root ignore fallback and an unrelated ontology
warning mean its result is advisory. No current LSP executable was found in PATH.
Praeforma's project endpoint responds, but a matching approved distribution spec
has not been established. Actio lookup recovered; no matching library task was
found in the software/library searches. Unrelated Cocoiru tasks are not linked.

Reference: RFC 9449 describes proof-of-possession and authorization-code key
binding, not native application attestation:
https://www.rfc-editor.org/rfc/rfc9449.html
