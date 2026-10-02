# GLAB Hub bootstrap

ID: SPEC-GLAB-BOOTSTRAP

## Responsibility

The supporting platform-shell domain owns preparation of the GLAB hub checkout. It initializes the pinned Corpus submodule and Corpus's own submodules (`lib/vestigium`, `lib/cernere`) when absent, builds Vestigium (its `dist/` is not committed and a `file:` dependency install does not build it), installs locked dependencies in Corpus and GLAB, and builds the hub UI. The Discord bot is a separate deployment.

## Invariants

- An initialized Corpus, or a Corpus nested submodule, at another revision is rejected, as is a Corpus with tracked/untracked changes; setup never resets them. Only missing submodules are initialized at the recorded gitlink.
- Setup runs without prompts or service startup. Existing databases, environment files and secrets remain untouched. Runtime schema initialization belongs to the existing server.
- Failed dependency installation or build fails the operation. Data export/import is explicitly unsupported and exits unsuccessfully.

## Deployment prerequisites

The Ex bootstrap API currently accepts only LUDIARS repositories. GLAB is VGA-GLAB/GLAB-Hub and its catalog requires the checkout name GLAB, so this manifest alone does not enable API cloning. Provision that checkout through the approved operator path. Configure EXCUBITOR_TRUSTED_FRAGMENT_REPOS=GLAB, remote Cernere/issuer credentials, the Mac PostgreSQL connection via secret injection, and the deployment public URL before starting through Ex. Do not copy local development database credentials to AWS or launch all dependencies there by assumption.
