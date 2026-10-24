# Releasing

> [!NOTE]
> **Fork Notice & Target Safety:**
> This personal public fork (<https://github.com/AneekRahman/OpenMausBot>) does **not** publish
> pre-built binary releases or maintain official auto-update streams. Users are onboarded via
> source builds (`pnpm dev` / `pnpm package:*`).
>
> The release automation documented below describes the upstream release process and serves
> as a reference for maintainers who configure release workflows on their own forks.
> Any automated releases or manual uploads cut from this fork must target the fork's own
> repository (<https://github.com/AneekRahman/OpenMausBot>) and must **never** target or attempt
> to publish to upstream repositories (`milind-soni/OpenMausBot` or `openmausbot-releases`).

For a normal release in upstream or a fully-configured fork, run **Actions → Prepare next release → Run workflow** and
choose a patch, minor, or custom version. It opens a tiny version-bump PR;
merging that PR automatically starts **Release** and assembles a draft from the
exact merge commit. Review and publish the draft when it is ready.

The existing **Actions → Release → Run workflow** button remains available for
reruns and recovery. It
builds macOS (arm64 + x64, signed, notarized, stapled), Windows, and Ubuntu
from a single pinned commit, verifies every artifact the way a user would
receive it, and assembles the draft in the repository releases.
Upstream stages assets to both the canonical repository and legacy release mirrors
for historical updater migration.

Tick **publish** to publish and verify the canonical release first, then make
the identical legacy updater bridge visible (if configured). Leave it unticked to review the
canonical draft; when you publish that draft in GitHub's UI, the **Sync
published release** workflow verifies and publishes automatically.

The release commit must have passed CI: the **CI passed on the release commit**
job waits (while the platforms build) for ci.yml's `CI` check on the pinned
commit and stops the release before any draft if it failed. If that commit
has no CI run, or a newer merge replaced it, the job runs CI on the commit
itself on a temporary `release-ci/v<version>` branch. After a flaky failure,
re-run the failed CI jobs; a release still waiting picks up the new attempt,
and a release that already stopped needs only `gh run rerun <id> --failed`.
`ship_without_ci` skips the wait, for emergencies only.

The workflow refuses to overwrite an already-published version. Manual Release
runs still require `package.json`'s version to be bumped on the selected ref.
A release is rejected if any installer, stable download
name, updater feed, blockmap, size, or digest is absent or inconsistent.

GitHub generates the release body from pull requests since the previous
canonical tag. The docs changelog combines published canonical releases with
the legacy archive into one complete history and caches it for five minutes.
Configure the optional Vercel hook below to rebuild the docs immediately after
publication; otherwise the live cache or the next normal docs deployment
refreshes it.

## Updater migration invariant (Upstream Reference)

`app-update.yml` is baked into every packaged desktop app. In upstream: builds through
0.1.46 point to `milind-soni/openmausbot-releases`; newer builds point to
`milind-soni/OpenMausBot`. For forks, `app-update.yml` should be pointed at the fork's
own repository (e.g., `AneekRahman/OpenMausBot`) if auto-updates are enabled.

1. In upstream, every new release was published byte-for-byte to both repositories during
   the bridge period.
2. The legacy mirror remains for historical clients in upstream.
3. README and docs downloads point at the canonical repo.

The npm package is published separately and its versioned `.tgz` is attached
only to the canonical release. It is not a desktop updater artifact; the
mirror checks permit that one extra file while still verifying the complete,
byte-identical desktop asset set.

## Why the gates exist

Each verification step in `release.yml` maps to a real incident from the
hand-cut releases (0.1.15–0.1.25): stale build output breaking the code
signature, a bare import killing the packaged server on launch while every
check stayed green, helper paths resolving outside the app after bundling,
stapling silently invalidating every published hash, and a finished release
sitting invisible as a draft. Don't remove a gate without reading the comment
above it.

## Bundled browser gates

Desktop builds also stage a pinned engine and Chromium Headless Shell before
packaging. Pre-signing checks validate complete resources and upstream hashes;
native browser smoke tests and macOS signature checks run on the packaged
output. See [browser packaging](browser-packaging.md) for update ownership,
license provenance and Linux sandbox constraints. Missing browser resources
must fail the build, not ship an installer that downloads them on first use.

## One-time setup: release secrets

If configuring automated releases on a repository, set these in
**Settings → Secrets and variables → Actions**.

The **Prepare next release** workflow also needs
**Settings → Actions → General → Workflow permissions → Allow GitHub Actions
to create and approve pull requests** enabled. The workflow only creates the
version PR; it never approves or merges it.

### 1. `MAC_CERT_P12_BASE64` + `MAC_CERT_PASSWORD`

The Developer ID Application certificate, exported from the Mac that
signs releases:

```sh
# Keychain Access → My Certificates → "Developer ID Application: <Your Name> (<TEAM_ID>)"
# → right-click → Export… → .p12 with a strong password, then:
base64 -i DeveloperID.p12 | pbcopy   # → MAC_CERT_P12_BASE64
# the export password             → MAC_CERT_PASSWORD
```

### 2. `APPLE_API_KEY_P8_BASE64` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER_ID`

An App Store Connect API key for notarization (better than an app-specific
password for CI — revocable, scoped, no 2FA dance):

1. [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. Generate a **Team Key** with the **Developer** role
3. Download the `.p8` (one chance only), note the Key ID and Issuer ID

```sh
base64 -i AuthKey_XXXXXXXX.p8 | pbcopy   # → APPLE_API_KEY_P8_BASE64
```

### 3. `RELEASES_PAT` (If using a release mirror repo)

A fine-grained personal access token that lets the workflow write to a
release mirror repo: **GitHub → Settings → Developer settings →
Fine-grained tokens** → repository access → permissions: **Contents: Read and write**.
The primary release uses the workflow's scoped `GITHUB_TOKEN` and does not need a PAT.

### 4. Optional `DOCS_DEPLOY_HOOK_URL`

In Vercel or your hosting provider, open the docs project and create a **Deploy Hook**
for its production branch. Store that private URL as the `DOCS_DEPLOY_HOOK_URL`
repository secret. Publishing a release then requests a fresh docs deployment so the
generated changelog appears immediately. Do not put the hook URL in source control.

### Local fallback

The hand-cut path still works when Actions is down or a release needs
surgery: `pnpm package:mac`, gate with `codesign --verify --deep --strict`,
notarize with the local keychain profile (`xcrun notarytool submit …
--keychain-profile AC_PASSWORD`), staple, re-zip, regenerate blockmaps and
`node scripts/regenerate-mac-feed.mjs`, upload the asset set to the release
repository, and verify published bytes.
