# SPEC-GLAB-LIBRARY-DELIVERY-001

Decision, neco 2026-10-28: any logged-in user may download. There is no device
enrollment or native application attestation. Web is browsing-only as a UI;
an authenticated user can intentionally call the API with other software.
Existing outer admission and user authentication remain mandatory.

## Implemented protocol

POST `/api/x/software-library/download/:id`, application/json (8 KiB maximum):
`{publicKey: RSA-3072 SPKI PEM, nonce: 32 random bytes lowercase hex}`.
The client creates an ephemeral recipient key and a fresh nonce per transfer,
after login. No persistent/shared decryption key is delivered at login.

The server reads `<GLAB_LIBRARY_RELEASE_ROOT>/<id>.cocoiru`, a signed JSON
container up to 24 MiB with a payload up to 16 MiB. Root must be absolute and
operator-owned, outside all static-serving directories; symlinks are rejected.
No downloadUrl is fetched. Only published metadata matching the signed release
ID/version/OS/kind/hash can be delivered. Withdrawn/missing/invalid releases fail.
Global concurrent downloads per process are limited to two. No timer/session/key
database is added. No startup network traffic occurs.

Signed container: base64 `manifest`, `signature`, `certificate` (DER), `payload`.
Manifest UTF-8 bytes are signed using RSA PKCS#1 v1.5 SHA-256. Manifest contains
format `glab-library-v1`, id, version, filename, bytes, sha256, platform, kind.
Server and broker require a separately provisioned exact SHA-256 certificate
pin, RSA >=3072, code-signing EKU, non-CA and a currently valid certificate.
Only algorithm selection and framing are application code; crypto operations
use Node/OpenSSL and Windows/.NET. No crypto library, install script or indirect
dependency is introduced. No home-grown signature/encryption algorithm.

Delivery response: format `glab-delivery-v1`, request nonce, base64 iv/tag,
wrappedKey and ciphertext. Fresh 32-byte AES key + 12-byte nonce, AES-256-GCM
with 16-byte tag. AAD is UTF-8 `glab-delivery-v1:<request nonce>`. Key wrapping
uses RSA-OAEP SHA-256 (including MGF1) with identical AAD as OAEP label. Server
zeros the temporary AES key. HTTPS is required by Cocoiru. No private signing
key, user token or plaintext AES key is sent in the response.

Broker checks the nonce, decrypts with authenticated encryption, verifies the
signed container against its independently provisioned pin, and checks catalog
identity/version/platform/kind before saving the original `.cocoiru` container
under its private staging directory. No extraction, installer execution or DLL
loading occurs. Filename/path are not taken from the signed payload. Re-login,
logout or account/config change prevents a pending transfer from being saved.
Previously downloaded files remain accessible to the user; this is not DRM.

## Certificate operations

Run `scripts/new-library-certificate.ps1` as the designated GLab release-signing
account. It creates a non-exportable RSA-3072 code-signing key in that account's
Windows CNG certificate store, and exports only the public certificate. It does
not install a Windows trust root. Never run it at server startup or on every
download. `scripts/sign-library-release.ps1` signs an explicitly selected local
artifact using that store key, without exporting it. Both refuse overwrite.

Distribute the certificate SHA-256 through a trusted administrator/installer
channel to GLab's `GLAB_LIBRARY_CERT_SHA256` and Cocoiru's same-named environment
setting. Never learn the pin from the download response. This is exact leaf
pinning, not arbitrary CA chain validation. Rotate by distributing a new pin
and replacing approved artifacts; removing the pin disables new downloads.
No CRL/OCSP or retroactive revocation of offline copies is claimed. Signed
packages are downloads, not automatically loadable plugins; installation and
native load-time verification remain separate acceptance work.

## Required verification and deployment

Check tampered manifest/payload/signature, unknown/expired cert, wrong nonce,
wrong recipient, corrupt tag, malformed/oversized input, anonymous and service
requests, missing config, withdrawal, account switch, destination collision.
Certificates and real artifacts are not created just to make tests pass.
Deployment requires an operator-owned signing identity, public pin and signed
release; none are fabricated or silently defaulted. Native UI execution remains
blocked by Cocoiru's existing uninstalled SDK prerequisites.

References: Node crypto APIs https://nodejs.org/api/crypto.html; protocol uses
only APIs present in the repository's Node 22+ runtime, not newer API additions.

## Validation evidence, 2026-10-28

Seven GLab offline tests passed: signed-container integrity/expiry/pinning,
catalog-release identity, recipient wrapping/authenticated encryption, metadata
projection, catalog route authorization/validation, URL rejection and actual
authenticated encrypted delivery plus withdrawal. Cocoiru's three broker tests
also passed against an identical public fixture. Fixture private key was created
only in memory and discarded; it is not a production certificate or trust pin.
Type checks and selected bundles passed using the installed Corpus/dependencies
through a read-only resolver; this is not a full production build. Certificate
scripts passed PowerShell parsing; persistent certificate-store provisioning
has not run. Testing claims were released. No production artifact published.
