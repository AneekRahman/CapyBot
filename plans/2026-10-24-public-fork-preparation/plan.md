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
