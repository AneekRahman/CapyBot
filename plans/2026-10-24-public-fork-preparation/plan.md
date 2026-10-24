# Prepare a public fork without private operational records

**Status:** in-progress
**Owner:** fork maintainers · **Created:** 2026-10-24 · **Shipped:** not yet

## Problem

The development branch mixes reusable product changes with private deployment records, personal fixture data, and an independent video application. Publishing it directly would expose material unrelated to a reusable public fork.

## Root cause

Product development and private operations share one branch. Release and hosted-service defaults also assume the upstream maintainer's infrastructure.

## Plan

1. Start a separate checkout at the shared upstream baseline and retain that ancestry.
2. Exclude enterprise code, private deployment files, existing internal plans, and scratch files from the final tree. Historical upstream enterprise code remains by explicit maintainer choice.
3. Replay reusable product changes as separate commits, replacing personal fixture identifiers before committing.
4. Generalize public documentation and deployment examples; disable publisher jobs until explicitly configured and prevent inherited telemetry or updates from targeting upstream by default.
5. Verify retained features and the OSS build using isolated fixtures, scan candidate history and packaging inputs, and record the result here.
6. Present the exact candidate commits and verdict for human approval before any push.

## Verification

- Verify the shared upstream baseline remains an ancestor and excluded paths are absent from the final tracked tree.
- Compare the replayed product tree against the selected source tree with an explicit list of intentional differences.
- Run typechecking, lint, relevant feature tests, production builds, and a disposable fake-engine server check according to `docs/verification/README.md`.
- Scan only candidate history and inspect distribution inputs for secrets and private identifiers.
- Preserve the original checkout and live deployments; do not push or create releases during preparation.

## Status log

- 2026-10-24 — Preparation authorized; separate checkout created at the shared upstream baseline. No push authorized.
- 2026-10-24 — Replayed 33 product commits; omitted 62 commits containing only excluded material. New commits use a public noreply identity and synthetic account fixtures.
- 2026-10-24 — Public contributor and source-build documentation committed as `627888d07`; safe distribution defaults and isolated packaging regression committed as `bce82813a`.
- 2026-10-24 — Verified 518 retained-feature tests, 13 OSS fallback tests, distribution tests, and 1,056 Electron tests (3 platform skips). Lint, 12 locale catalogs, and theme contrast checks passed.
- 2026-10-24 — Typechecking and production builds passed using `NODE_OPTIONS=--max-old-space-size=8192`; the default heap was insufficient for server typechecking in the verification environment.
- 2026-10-24 — Seven packaged-server smoke checks passed. A disposable fake-engine fixture passed doctor, bot listing, a chat/tool turn, and message readback; the launcher and temporary data were cleaned up.

## Project environment

The product is an Electron/React TypeScript application, not React Native. The
declared runtime is Node 24 or later and pnpm 10.33.0; verification used Node
26.9.0. Dependencies were installed with a frozen lockfile and
`OMB_SKIP_HOOKS=1` to avoid changing shared checkout hook configuration.

The verification commands were:

```sh
pnpm lint
pnpm i18n:check
pnpm check:contrast
pnpm typecheck
NODE_OPTIONS="--max-old-space-size=8192" pnpm exec tsc -p tsconfig.server.json
NODE_OPTIONS="--max-old-space-size=8192" pnpm build
NODE_OPTIONS="--max-old-space-size=8192" pnpm build:server
pnpm test:electron
pnpm broker:test
pnpm exec vitest run scripts/build-npm-package.test.mjs
node scripts/smoke-packaged-server.mjs
node --experimental-strip-types scripts/control-omb.ts launch
```

Fixture commands used the launcher's explicit ephemeral loopback URL. A fake
engine completed a turn and its tool activity was read back through the shared
control surface. This does not qualify real provider sign-in, live hosted
deployments, every renderer interaction, or signed native installer releases.
