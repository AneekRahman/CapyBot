# Licensing

The current tracked tree of OpenMausBot in this repository is open source under the
[Apache License 2.0](LICENSE).

## Current tree: open-source edition without `enterprise/`

Upstream OpenMausBot utilized an open-core structure where core features are
licensed under Apache 2.0 and an optional `enterprise/` directory was licensed
under the proprietary OpenMausBot Enterprise License. Historical upstream commits
in the repository history that contain enterprise code remain subject to their original
upstream license terms; this repository does not relicense shared upstream history.

In this checkout (<https://github.com/AneekRahman/CapyBot>), the `enterprise/`
directory has been excluded from the active tree. As designed upstream, without
that directory the server reports `{"edition":"oss"}` and ordinary standalone
operation is unchanged. The current tree is licensed under the Apache License 2.0.

## Contributions

Contributions to the current tree in this repository are submitted under the
[Apache License 2.0](LICENSE). No Contributor License Agreement (CLA) or
Developer Certificate of Origin (DCO) sign-off is required for this repository.
Submit only code you wrote or have the right to contribute.

(The historical upstream [CLA.md](CLA.md) applied solely to contributions to upstream's
`enterprise/` directory and is preserved for historical context.)

## Third-party components and trademarks

Bundled third-party software keeps its own licenses; notices, license texts,
source locations, and the SBOM are listed in [NOTICE](NOTICE) and
[`third_party/`](third_party/).

The OpenMausBot and MausBot names and the mascot are trademarks of Supamaus
Software Private Limited; the Apache License does not grant trademark rights
(section 6). This fork does not claim or grant any trademark rights, and any
product or distribution built on OpenMausBot needs its own name unless a partner
agreement with the trademark owner says otherwise.
